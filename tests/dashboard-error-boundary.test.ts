import test from "node:test";
import assert from "node:assert/strict";
import { notFound, redirect } from "next/navigation";
import { ErrorBoundary } from "../features/dashboard/components/ErrorBoundary";

function thrown(fn: () => void): Error {
  try { fn(); } catch (error) { return error as Error; }
  throw new Error("expected a throw");
}
function boundaryWith(error: Error) {
  const boundary: any = new (ErrorBoundary as any)({ children: "child" });
  boundary.state = (ErrorBoundary as any).getDerivedStateFromError(error);
  return boundary;
}

test("notFound() and redirect() reach Next instead of the generic error screen", () => {
  for (const error of [thrown(() => notFound()), thrown(() => redirect("/dashboard"))]) {
    assert.throws(() => boundaryWith(error).render(), (caught) => caught === error);
  }
});

test("a real failure still renders the recovery screen", () => {
  const rendered = boundaryWith(new Error("boom")).render();
  assert.notEqual(rendered, "child");
  assert.ok(rendered && typeof rendered === "object");
});

test("healthy children render untouched", () => {
  const boundary: any = new (ErrorBoundary as any)({ children: "child" });
  assert.equal(boundary.render(), "child");
});
