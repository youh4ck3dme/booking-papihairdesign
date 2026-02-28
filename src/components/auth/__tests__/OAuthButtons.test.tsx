import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

// Mock lovable auth
vi.mock("@/integrations/lovable/index", () => ({
  lovable: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("OAuthButtons", () => {
  it("renders Google and Apple buttons", () => {
    render(<OAuthButtons />);
    expect(screen.getByText("Prihlásiť sa cez Google")).toBeInTheDocument();
    expect(screen.getByText("Prihlásiť sa cez Apple")).toBeInTheDocument();
  });

  it("renders divider text", () => {
    render(<OAuthButtons />);
    expect(screen.getByText("alebo")).toBeInTheDocument();
  });

  it("disables buttons when disabled prop is true", () => {
    render(<OAuthButtons disabled />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("calls signInWithOAuth with google on click", async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    render(<OAuthButtons />);
    fireEvent.click(screen.getByText("Prihlásiť sa cez Google"));
    expect(lovable.auth.signInWithOAuth).toHaveBeenCalledWith("google", {
      redirect_uri: "http://localhost:3000",
    });
  });

  it("calls signInWithOAuth with apple on click", async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    render(<OAuthButtons />);
    fireEvent.click(screen.getByText("Prihlásiť sa cez Apple"));
    expect(lovable.auth.signInWithOAuth).toHaveBeenCalledWith("apple", {
      redirect_uri: "http://localhost:3000",
    });
  });

  it("shows error toast on OAuth failure", async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    const { toast } = await import("sonner");
    (lovable.auth.signInWithOAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: new Error("fail"),
    });
    render(<OAuthButtons />);
    fireEvent.click(screen.getByText("Prihlásiť sa cez Google"));
    // Wait for async
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Prihlásenie cez Google zlyhalo");
    });
  });
});
