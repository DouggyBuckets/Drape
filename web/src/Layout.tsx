import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "./auth";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">Drape</Link>
        <nav className="nav">
          <NavLink to="/" end>Outfit</NavLink>
          <NavLink to="/wardrobe">Wardrobe</NavLink>
        </nav>
        <div className="account">
          <span className="muted small">{user?.readOnly ? "Demo" : user?.email}</span>
          <button
            className="link-button"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            {user?.readOnly ? "Exit demo" : "Log out"}
          </button>
        </div>
      </header>
      {user?.readOnly && (
        <div className="banner">
          You're viewing a demo wardrobe (read-only). <Link to="/login" onClick={() => logout()}>Sign up</Link> to build your own.
        </div>
      )}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
