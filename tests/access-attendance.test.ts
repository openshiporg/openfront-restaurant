import test from 'node:test';
import assert from 'node:assert/strict';
import { restaurantAttendance, recordRestaurantAttendance, requestRestaurantTimeCorrection, approveRestaurantTimeCorrection } from '../features/keystone/mutations/attendance';
import { attendanceDateRange, attendanceTransaction, readAttendanceState, writeAttendanceState, validateTimeWindow } from '../features/keystone/utils/attendance';
import { calculateRestaurantTipPool, createTipPoolLedger, updateTipPoolStatus } from '../features/keystone/mutations/tipManagement';
import { tipPoolCsv } from '../features/platform/staff/lib/tipCsv';
import { TimeEntry } from '../features/keystone/models/TimeEntry';
import { upsertShift, updateShiftStatus } from '../features/keystone/mutations/shiftManagement';
import { Shift } from '../features/keystone/models/Shift';

function fixture() {
  const entries: any[] = [], events: any[] = [], pools: any[] = [], shifts: any[] = [];
  const users: Record<string, any> = { employee: { id: 'employee', name: '=Employee', isActive: true, staffRole: 'server', hourlyRate: '15' }, manager: { id: 'manager', name: 'Manager', isActive: true, staffRole: 'manager' }, stranger: { id: 'stranger', isActive: true, staffRole: 'server' } };
  let sequence = 0, conflicts = 0;
  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
    if (key === 'OR') return value.some((item: any) => match(row, item));
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, compare]: any) => op === 'in' ? compare.includes(row[key]) : op === 'not' ? row[key] !== compare : op === 'lt' ? row[key] < compare : op === 'lte' ? row[key] <= compare : op === 'gt' ? row[key] > compare : op === 'gte' ? row[key] >= compare : true);
    return row[key] === value;
  });
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => users[where.id] },
    shift: {
      findFirst: async ({ where }: any) => shifts.find(row => match(row, where)) || null,
      findUnique: async ({ where }: any) => shifts.find(row => row.id === where.id),
      create: async ({ data }: any) => { const row = { id: `shift-${++sequence}`, ...data }; shifts.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(shifts.find(row => row.id === where.id), data),
    },
    storeSettings: { findUnique: async ({ where }: any) => { assert.equal(where.id, 1); return { timezone: 'America/New_York', currencyCode: 'USD' }; } },
    timeEntry: {
      findFirst: async ({ where }: any) => entries.find(row => match(row, where)) || null,
      findUnique: async ({ where }: any) => entries.find(row => row.id === where.id),
      findMany: async ({ where, skip = 0, take = entries.length }: any) => entries.filter(row => match(row, where)).slice(skip, skip + take).map(row => ({ ...row, staff: users[row.staffId] })),
      create: async ({ data }: any) => { const row = { id: `entry-${++sequence}`, clockOut: null, ...data }; entries.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(entries.find(row => row.id === where.id), data),
    },
    auditEvent: {
      findUnique: async ({ where }: any) => events.find(row => match(row, where)),
      findMany: async ({ where, orderBy, take = events.length }: any) => { const rows = events.filter(row => match(row, where)); if (orderBy?.entityId) rows.sort((a, b) => b.entityId.localeCompare(a.entityId)); return rows.slice(0, take); },
      upsert: async ({ where, create }: any) => { const existing = events.find(row => match(row, where)); if (existing) return existing; const row = { id: `event-${++sequence}`, ...create }; events.push(row); return row; },
    },
    tipPool: {
      findMany: async ({ where }: any) => pools.filter(row => match(row, where)),
      findUnique: async ({ where }: any) => pools.find(row => row.id === where.id),
      create: async ({ data }: any) => { const row = { id: `pool-${++sequence}`, ...data }; pools.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(pools.find(row => row.id === where.id), data),
    },
  };
  let queue = Promise.resolve();
  prisma.$transaction = (callback: any, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const run = queue.then(async () => {
      if (conflicts > 0) { conflicts--; throw Object.assign(Error('serialization'), { code: 'P2034' }); }
      const snapshot = structuredClone({ entries, events, pools, shifts });
      try { return await callback(prisma); } catch (error) { entries.splice(0, entries.length, ...snapshot.entries); events.splice(0, events.length, ...snapshot.events); pools.splice(0, pools.length, ...snapshot.pools); shifts.splice(0, shifts.length, ...snapshot.shifts); throw error; }
    });
    queue = run.catch(() => {}); return run;
  };
  const context = (id = 'employee') => ({ prisma, session: { itemId: id, listKey: 'User', data: { isActive: true, role: { canManageStaff: id === 'manager' } } } });
  return { prisma, entries, events, pools, shifts, users, context, conflict: () => { conflicts++; } };
}
const request = (action: string, entryId?: string, extra = {}) => ({ action, entryId, idempotencyKey: `request-${action}-${entryId || 'new'}`, ...extra });

test('attendance denies inactive, unauthenticated, other owner and freely claimed paid breaks', async () => {
  const f = fixture();
  await assert.rejects(recordRestaurantAttendance(null, request('clock_in'), { ...f.context(), session: undefined }), /session/);
  f.users.employee.isActive = false;
  await assert.rejects(recordRestaurantAttendance(null, request('clock_in'), f.context()), /Active/);
  f.users.employee.isActive = true;
  const result = await recordRestaurantAttendance(null, request('clock_in'), f.context());
  await assert.rejects(recordRestaurantAttendance(null, request('clock_out', result.entryId), f.context('stranger')), /another employee/);
  await assert.rejects(recordRestaurantAttendance(null, request('start_break', result.entryId, { paidBreak: true }), f.context()), /management/);
});

test('clock-in is stable on retry, rejects rebinding, and serializes concurrent open-entry requests', async () => {
  const f = fixture(); f.conflict();
  const first = await recordRestaurantAttendance(null, request('clock_in'), f.context());
  assert.deepEqual(await recordRestaurantAttendance(null, request('clock_in'), f.context()), first);
  await assert.rejects(recordRestaurantAttendance(null, { ...request('clock_in'), action: 'clock_out' }, f.context()), /different input/);
  assert.equal(f.entries.length, 1);
  const g = fixture(); const results = await Promise.allSettled(['a', 'b'].map(key => recordRestaurantAttendance(null, request('clock_in', undefined, { idempotencyKey: `concurrent-${key}` }), g.context())));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(g.entries.length, 1);
});

test('break must finish before clock-out; unpaid minutes persist and approval needs employee attestation', async () => {
  const f = fixture(); const { entryId } = await recordRestaurantAttendance(null, request('clock_in'), f.context());
  f.entries[0].clockIn = new Date(Date.now() - 3_600_000);
  await recordRestaurantAttendance(null, request('start_break', entryId), f.context());
  await assert.rejects(recordRestaurantAttendance(null, request('clock_out', entryId), f.context()), /End your break/);
  const state = await readAttendanceState(f.prisma, entryId);
  await writeAttendanceState(f.prisma, 'manager', entryId, state, { breakStartedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
  await recordRestaurantAttendance(null, request('end_break', entryId), f.context());
  assert.equal(f.entries[0].breakMinutes, '10');
  await recordRestaurantAttendance(null, request('clock_out', entryId), f.context());
  await assert.rejects(recordRestaurantAttendance(null, request('approve_time', entryId), f.context('manager')), /attest/);
  await recordRestaurantAttendance(null, request('attest', entryId), f.context());
  await recordRestaurantAttendance(null, request('approve_time', entryId), f.context('manager'));
  assert.equal((await readAttendanceState(f.prisma, entryId)).approved, true);
  await assert.rejects(recordRestaurantAttendance(null, request('start_break', entryId, { idempotencyKey: 'closed-break-new' }), f.context()), /Closed time/);
});

test('corrections preserve original until independent approval and require renewed attestation; stale proposals reject', async () => {
  const f = fixture(); f.entries.push({ id: 'entry', staffId: 'employee', clockIn: new Date('2026-08-01T12:00Z'), clockOut: new Date('2026-08-01T20:00Z'), breakMinutes: '30' });
  const proposal = { entryId: 'entry', clockIn: '2026-08-01T12:00Z', clockOut: '2026-08-01T21:00Z', breakMinutes: 30, reason: 'Missed clock-out', idempotencyKey: 'correction-one' };
  const { requestId } = await requestRestaurantTimeCorrection(null, proposal, f.context());
  assert.equal(f.entries[0].clockOut.toISOString(), '2026-08-01T20:00:00.000Z');
  await assert.rejects(approveRestaurantTimeCorrection(null, { requestId, idempotencyKey: 'approve-self' }, f.context()), /management/);
  await approveRestaurantTimeCorrection(null, { requestId, idempotencyKey: 'approve-manager' }, f.context('manager'));
  assert.equal(f.entries[0].clockOut.toISOString(), '2026-08-01T21:00:00.000Z');
  assert.equal((await readAttendanceState(f.prisma, 'entry')).attested, false);
  const stale = await requestRestaurantTimeCorrection(null, { ...proposal, idempotencyKey: 'correction-stale' }, f.context());
  await recordRestaurantAttendance(null, request('attest', 'entry'), f.context());
  await assert.rejects(approveRestaurantTimeCorrection(null, { requestId: stale.requestId, idempotencyKey: 'approve-stale' }, f.context('manager')), /Time changed/);
  const own = await requestRestaurantTimeCorrection(null, { ...proposal, idempotencyKey: 'manager-proposal' }, f.context('manager'));
  await assert.rejects(approveRestaurantTimeCorrection(null, { requestId: own.requestId, idempotencyKey: 'manager-self-approve' }, f.context('manager')), /different manager/);
});

test('overlapping correction and invalid break windows reject atomically', async () => {
  const f = fixture();
  f.entries.push({ id: 'one', staffId: 'employee', clockIn: new Date('2026-08-01T12:00Z'), clockOut: new Date('2026-08-01T16:00Z'), breakMinutes: '0' }, { id: 'two', staffId: 'employee', clockIn: new Date('2026-08-01T17:00Z'), clockOut: new Date('2026-08-01T20:00Z'), breakMinutes: '0' });
  const { requestId } = await requestRestaurantTimeCorrection(null, { entryId: 'one', clockIn: '2026-08-01T12:00Z', clockOut: '2026-08-01T18:00Z', breakMinutes: 0, reason: 'Correction', idempotencyKey: 'overlap-request' }, f.context());
  await assert.rejects(approveRestaurantTimeCorrection(null, { requestId, idempotencyKey: 'overlap-approve' }, f.context('manager')), /overlaps/);
  assert.equal(f.entries[0].clockOut.toISOString(), '2026-08-01T16:00:00.000Z');
  assert.throws(() => validateTimeWindow('2026-08-01T12:00Z', '2026-08-01T13:00Z', 61), /break/);
});

test('tip allocation uses venue cutoff and approved actual attendance, conserving integer minor units', async () => {
  const f = fixture();
  f.events.push({ entityType: 'BusinessDay', entityId: '2026-08-01', eventType: 'business_day.opened', after: { timezone: 'America/New_York', cutoffMinutes: 240 } });
  f.entries.push({ id: 'late', staffId: 'employee', clockIn: new Date('2026-08-02T06:00Z'), clockOut: new Date('2026-08-02T07:00Z'), breakMinutes: '0', role: 'server' });
  const args = { date: '2026-08-01', tipPoolType: 'house_pool' as const, cashTips: '0.01', creditTips: '10', sourceNote: 'Till report 17; card report 18' };
  await assert.rejects(calculateRestaurantTipPool(f.prisma, args), /attested/);
  await writeAttendanceState(f.prisma, 'manager', 'late', { revision: 0 }, { approved: true, attested: true });
  const preview = await calculateRestaurantTipPool(f.prisma, args);
  assert.equal(preview.totalTips, 1001); assert.equal(preview.distributions[0].amount, 1001); assert.equal(preview.day, '2026-08-01');
  assert.equal((await createTipPoolLedger(null, args, f.context())).success, false);
  assert.equal((await createTipPoolLedger(null, { ...args, sourceNote: '' }, f.context('manager')))?.success, false);
  assert.equal((await createTipPoolLedger(null, args, f.context('manager')))?.success, true);
  assert.equal((await createTipPoolLedger(null, args, f.context('manager')))?.success, true); assert.equal(f.pools.length, 1);
  assert.match(f.pools[0].notes, /manual_reconciled_declaration/);
  assert.equal((await createTipPoolLedger(null, { ...args, cashTips: '20' }, f.context('manager')))?.success, false);
  assert.equal((await updateTipPoolStatus(null, { tipPoolId: f.pools[0].id, action: 'distribute' }, f.context('manager'))).success, false);
  const payout = { tipPoolId: f.pools[0].id, action: 'distribute', payoutReference: 'Cash receipt 24' };
  assert.equal((await updateTipPoolStatus(null, payout, f.context('manager'))).success, true);
  assert.equal((await updateTipPoolStatus(null, payout, f.context('manager'))).success, true);
  assert.equal(f.events.filter(event => event.eventType === 'tip_pool.payout_acknowledged').length, 1);
  assert.match(tipPoolCsv(f.pools), /'=Employee/);
});

test('raw attendance and scheduled shift CRUD cannot bypass domain transitions; failed transaction records no success', async () => {
  for (const model of [TimeEntry, Shift]) for (const operation of ['create', 'update', 'delete']) assert.equal((model.access as any).operation[operation]({}), false);
  const f = fixture();
  await assert.rejects(attendanceTransaction(f.context(), 'employee', 'failed-request', {}, async tx => { await tx.timeEntry.create({ data: { staffId: 'employee' } }); throw Error('interrupted'); }), /interrupted/);
  assert.equal(f.entries.length, 0); assert.equal(f.events.length, 0);
});

test('manager schedule actions create real time, preserve started attendance and reject overnight overlaps', async () => {
  const f = fixture();
  const args = { staffId: 'employee', role: 'server', startTime: '2026-08-01T22:00Z', endTime: '2026-08-02T04:00Z', hourlyRate: '15' };
  assert.equal((await upsertShift(null, args, f.context())).success, false);
  assert.equal((await upsertShift(null, args, f.context('manager'))).success, true);
  assert.equal((await upsertShift(null, args, f.context('manager'))).success, true); assert.equal(f.shifts.length, 1);
  assert.equal((await upsertShift(null, { ...args, startTime: '2026-08-02T01:00Z', endTime: '2026-08-02T06:00Z' }, f.context('manager'))).success, false);
  const shiftId = f.shifts[0].id;
  assert.equal((await updateShiftStatus(null, { shiftId, action: 'start' }, f.context('manager'))).success, true);
  assert.equal((await updateShiftStatus(null, { shiftId, action: 'start' }, f.context('manager'))).success, true); assert.equal(f.entries.length, 1);
  assert.equal((await upsertShift(null, { ...args, shiftId }, f.context('manager'))).success, false);
  f.entries[0].clockIn = new Date(Date.now() - 3600000);
  assert.equal((await updateShiftStatus(null, { shiftId, action: 'complete' }, f.context('manager'))).success, true);
  assert.ok(f.entries[0].clockOut);
  assert.equal((await readAttendanceState(f.prisma, f.entries[0].id)).attested, false);
});

test('fiscal range uses durable venue cutoff across DST and paginates beyond 100 without exposing another employee', async () => {
  const f = fixture();
  f.events.push({ entityType: 'BusinessDay', entityId: '2026-03-01', eventType: 'business_day.opened', after: { timezone: 'America/New_York', cutoffMinutes: 240 } });
  const window = await attendanceDateRange(f.prisma, '2026-03-07', '2026-03-07');
  assert.equal(window!.gte.toISOString(), '2026-03-07T09:00:00.000Z');
  assert.equal(window!.lt.toISOString(), '2026-03-08T08:00:00.000Z');
  for (let i = 0; i < 205; i++) f.entries.push({ id: `e-${i}`, staffId: 'employee', role: 'server', clockIn: new Date('2026-03-07T12:00Z'), clockOut: new Date('2026-03-07T13:00Z'), breakMinutes: '0' });
  f.entries.push({ id: 'other', staffId: 'stranger', clockIn: new Date('2026-03-07T12:00Z'), clockOut: new Date('2026-03-07T13:00Z') });
  const args = { fromDate: '2026-03-07', toDate: '2026-03-07', take: 200 };
  const first = await restaurantAttendance(null, args, f.context()); const second = await restaurantAttendance(null, { ...args, skip: 200 }, f.context());
  assert.equal(first.entries.length, 200); assert.equal(first.hasMore, true); assert.equal(second.entries.length, 5); assert.equal(second.hasMore, false);
  assert.equal(second.entries.some(entry => entry.id === 'other'), false);
  await assert.rejects(restaurantAttendance(null, { ...args, take: 201 }, f.context()), /page/);
  await assert.rejects(attendanceDateRange(f.prisma, '2026-02-30', '2026-03-01'), /valid/);
});
