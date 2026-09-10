import { Link, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { EmptyState } from "@/components/primitives/States";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { isAdmin } from "@/lib/roles";
import { Clients } from "@/pages/Clients";
import { Dashboard } from "@/pages/Dashboard";
import { EngagementDetail } from "@/pages/EngagementDetail";
import { Engagements } from "@/pages/Engagements";
import { Login } from "@/pages/Login";
import { Services } from "@/pages/Services";
import { TaskDetail } from "@/pages/TaskDetail";
import { Tasks } from "@/pages/Tasks";
import { Users } from "@/pages/Users";

/**
 * Routes.
 *
 * Task detail is a child of both the task list and the engagement view, so the
 * sheet opens over whichever list you came from and closing it leaves you
 * where you were. It is a real URL either way, so it can be linked.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />

        <Route path="tasks" element={<Tasks />}>
          <Route path=":id" element={<TaskDetail />} />
        </Route>

        <Route path="engagements" element={<Engagements />} />
        <Route path="engagements/:id" element={<EngagementDetail />}>
          <Route path="tasks/:id" element={<TaskDetail />} />
        </Route>

        <Route path="clients" element={<Clients />} />
        <Route path="services" element={<Services />} />

        <Route
          path="users"
          element={
            <RequireAdmin>
              <Users />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/**
 * Keeps the wrong role off an admin page.
 *
 * This is routing, not security - the auth service refuses the same requests
 * regardless of what the browser renders.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) return null;
  if (!isAdmin(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function NotFound() {
  return (
    <EmptyState
      title="This page does not exist"
      description="The link may be out of date, or the page may have moved."
      action={
        <Button asChild variant="primary" size="sm">
          <Link to="/">Back to the dashboard</Link>
        </Button>
      }
    />
  );
}
