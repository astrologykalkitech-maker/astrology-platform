import { redirect } from "next/navigation";

export default function Home() {
  // Redirect to the customer dashboard, not the login page.
  // If the user is not logged in, the dashboard layout will handle redirecting to login.
  redirect("/customer");
}