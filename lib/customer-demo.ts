export const CUSTOMER_BOOKINGS_STORAGE_KEY = "astroconnect-bookings-demo-v1";

export type CustomerDemoBooking = {
  id: string;
  astrologer: string;
  service: string;
  consultation: "Chat" | "Call" | "Video";
  date: string;
  time: string;
  status: "Upcoming" | "Completed";
  price: number;
};

export function isCustomerDemoBooking(
  value: unknown,
): value is CustomerDemoBooking {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "astrologer" in value &&
    typeof value.astrologer === "string" &&
    "service" in value &&
    typeof value.service === "string" &&
    "consultation" in value &&
    (value.consultation === "Chat" ||
      value.consultation === "Call" ||
      value.consultation === "Video") &&
    "date" in value &&
    typeof value.date === "string" &&
    "time" in value &&
    typeof value.time === "string" &&
    "status" in value &&
    (value.status === "Upcoming" || value.status === "Completed") &&
    "price" in value &&
    typeof value.price === "number" &&
    Number.isFinite(value.price)
  );
}
