import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({ native: vi.fn(), social: vi.fn() }));
vi.mock("@/lib/native-google", () => ({ nativeGoogleSignIn: mocks.native }));
vi.mock("@/lib/auth", () => ({
  signIn: { email: vi.fn(), social: mocks.social },
  signUp: { email: vi.fn() },
}));

import { LoginPage } from "../LoginPage";
import { I18nProvider } from "@/i18n/provider";

function renderLogin() {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const googleButton = () =>
  screen.getAllByRole("button").find((b) => /google/i.test(b.getAttribute("aria-label") ?? ""))!;

beforeEach(() => {
  mocks.native.mockReset();
  mocks.social.mockReset();
});
afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe("LoginPage Google sign-in", () => {
  it("uses the native account picker inside the Android app, never the web OAuth redirect", async () => {
    // Google blocks its web OAuth flow in a WebView (disallowed_useragent).
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    mocks.native.mockResolvedValue(undefined);
    renderLogin();

    fireEvent.click(googleButton());

    await waitFor(() => expect(screen.getByText("home")).toBeTruthy());
    expect(mocks.native).toHaveBeenCalledTimes(1);
    expect(mocks.social).not.toHaveBeenCalled();
  });

  it("keeps the web OAuth redirect in the browser", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    mocks.social.mockResolvedValue({ data: null });
    renderLogin();
    fireEvent.click(googleButton());
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" }));
  });

  it("stays on the login page with an error when native sign-in fails", async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    mocks.native.mockRejectedValue(new Error("Invalid token"));
    renderLogin();
    fireEvent.click(googleButton());
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("home")).toBeNull();
  });
});
