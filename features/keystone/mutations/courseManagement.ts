import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendKitchenTicketEvent } from "../utils/kitchenTicketEvents";

interface FireCourseArgs {
  courseId: string;
}

interface RecallCourseArgs {
  courseId: string;
}

interface CourseManagementResult {
  success: boolean;
  error: string | null;
}

export async function fireCourse(
  root: any,
  args: FireCourseArgs,
  context: Context
): Promise<CourseManagementResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }

  const { courseId } = args;
  const sudo = context.sudo();

  try {
    await sudo.db.OrderCourse.updateOne({
      where: { id: courseId },
      data: {
        status: 'fired',
        fireTime: new Date().toISOString()
      }
    });

    const course = await sudo.query.OrderCourse.findOne({
      where: { id: courseId },
      query: 'order { id } orderItems { id }'
    });

    if (course?.orderItems?.length) {
      await Promise.all(
        course.orderItems.map((item: any) =>
          sudo.db.OrderItem.updateOne({
            where: { id: item.id },
            data: {
              sentToKitchen: new Date().toISOString(),
              firedAt: new Date().toISOString(),
              kitchenStatus: 'new',
            }
          })
        )
      );
    }

    await appendKitchenTicketEvent(context, {
      eventType: 'dispatch',
      orderId: course?.order?.id,
      payload: { courseId, action: 'fire', orderItemIds: (course?.orderItems || []).map((item: any) => item.id) },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function recallCourse(
  root: any,
  args: RecallCourseArgs,
  context: Context
): Promise<CourseManagementResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized" };
  }

  const { courseId } = args;
  const sudo = context.sudo();

  try {
    await sudo.db.OrderCourse.updateOne({
      where: { id: courseId },
      data: {
        status: 'pending',
        fireTime: null
      }
    });
    const course = await sudo.query.OrderCourse.findOne({
      where: { id: courseId },
      query: 'order { id } orderItems { id }',
    });
    const recalledAt = new Date().toISOString();
    await Promise.all((course?.orderItems || []).map((item: any) =>
      sudo.db.OrderItem.updateOne({
        where: { id: item.id },
        data: { kitchenStatus: 'recalled', recalledAt },
      })
    ));
    await appendKitchenTicketEvent(context, {
      eventType: 'recall',
      orderId: course?.order?.id,
      payload: { courseId, action: 'recall', orderItemIds: (course?.orderItems || []).map((item: any) => item.id) },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
