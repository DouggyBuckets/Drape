import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth";
import { Layout } from "./Layout";
import { LoginPage } from "./pages/LoginPage";
import { OutfitPage } from "./pages/OutfitPage";
import { WardrobePage } from "./pages/WardrobePage";
import "./styles.css";

function RequireAuth() {
  const { user } = useAuth();
  if (user === undefined) return <p className="muted center">Loading…</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<OutfitPage />} />
              <Route path="/wardrobe" element={<WardrobePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
