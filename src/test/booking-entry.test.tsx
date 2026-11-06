import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it } from "vitest";
import BookingEntryRedirect from "../components/BookingEntryRedirect";

it("replaces the landing entry, preserves URL context and supports history", async () => {
  const router = createMemoryRouter([
    { path: "/before", element: <div>Before</div> },
    { path: "/", element: <BookingEntryRedirect /> },
    { path: "/booking", element: <div>Booking</div> },
  ], { initialEntries: ["/before", "/?lang=en#services"] });
  render(<RouterProvider router={router} />);
  await screen.findByText("Booking");
  expect(router.state.location.search).toBe("?lang=en");
  expect(router.state.location.hash).toBe("#services");
  await router.navigate(-1);
  await screen.findByText("Before");
  await router.navigate(1);
  await waitFor(() => expect(router.state.location.pathname).toBe("/booking"));
});
