import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { Loading } from "./components/ui";
import { Icon, type IconName } from "./components/Icon";
import Clients from "./pages/Clients";
import Dashboard from "./pages/Dashboard";
import Engagements from "./pages/Engagements";
import Login from "./pages/Login";
import Services from "./pages/Services";
import Team from "./pages/Team";
import TaskDetail from "./pages/TaskDetail";
import Tasks from "./pages/Tasks";

function Shell() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  if (!user) return null;

  const navItems: { to: string; label: string; icon: IconName; roles: string[] }[] = [
    { to: "/", label: "Overview", icon: "dashboard", roles: ["ADMIN", "MANAGER", "TEAM_MEMBER"] },
    { to: "/tasks", label: user.role === "TEAM_MEMBER" ? "My tasks" : "Tasks", icon: "check-square", roles: ["ADMIN", "MANAGER", "TEAM_MEMBER"] },
    { to: "/engagements", label: "Engagements", icon: "briefcase", roles: ["ADMIN", "MANAGER"] },
    { to: "/clients", label: "Clients", icon: "users", roles: ["ADMIN", "MANAGER"] },
    { to: "/services", label: "Service catalogue", icon: "layers", roles: ["ADMIN", "MANAGER"] },
    { to: "/team", label: "Team", icon: "users", roles: ["ADMIN"] },
  ];
  const sectionItems = navItems.filter((item) => item.roles.includes(user.role));
  const current = sectionItems.find((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
  );
  const roleLabel = user.role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const initials = `${user.first_name?.[0] ?? user.username[0]}${user.last_name?.[0] ?? ""}`;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`} aria-label="Primary navigation">
        <div className="sidebar__brand">
          <span className="brand-mark">T</span>
          <span>Taskline</span>
          <button className="sidebar__close icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>

        <div className="workspace-switcher">
          <span className="workspace-switcher__dot" />
          <span className="workspace-switcher__copy"><strong>Operations</strong><small>Client delivery</small></span>
          <Icon name="chevron-right" />
        </div>

        <nav className="sidebar__nav">
          <p className="nav-label">Workspace</p>
          {sectionItems.map((item) => (
            <NavLink
              end={item.to === "/"}
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className="nav-item"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <div className="user-card">
            <span className="avatar">{initials.toUpperCase()}</span>
            <span className="user-card__copy"><strong>{user.first_name || user.username}</strong><small>{roleLabel}</small></span>
            <button className="user-card__logout" onClick={logout} aria-label="Sign out">↗</button>
          </div>
        </div>
      </aside>
      {sidebarOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="app-frame">
        <header className="topbar">
          <button className="icon-button topbar__menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Icon name="menu" />
          </button>
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron-right" /><strong>{current?.label ?? "Overview"}</strong></div>
          <div className="topbar__actions">
            <span className="topbar__date">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date())}</span>
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/engagements" element={<Engagements />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/services" element={<Services />} />
            <Route path="/team" element={user.role === "ADMIN" ? <Team /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={user ? <Shell /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
