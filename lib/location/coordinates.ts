export function isValidGeoCoordinatePair(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export interface PujaVenueLocation {
  venueAddress: string;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type PujaVenueLocationValidation =
  | { success: true; location: PujaVenueLocation }
  | { success: false; error: string };

export function validatePujaVenueLocation(input: {
  venueAddress: unknown;
  landmark: unknown;
  latitude: unknown;
  longitude: unknown;
}): PujaVenueLocationValidation {
  if (typeof input.venueAddress !== "string") {
    return { success: false, error: "Enter the event venue address." };
  }

  const venueAddress = input.venueAddress.trim();
  if (venueAddress.length < 3 || venueAddress.length > 500) {
    return {
      success: false,
      error: "Venue address must be between 3 and 500 characters.",
    };
  }

  if (
    input.landmark !== undefined &&
    input.landmark !== null &&
    typeof input.landmark !== "string"
  ) {
    return { success: false, error: "Enter a valid venue landmark." };
  }
  const landmark = typeof input.landmark === "string" ? input.landmark.trim() : "";
  if (landmark.length > 200) {
    return { success: false, error: "Venue landmark must not exceed 200 characters." };
  }

  const hasLatitude = input.latitude !== undefined && input.latitude !== null;
  const hasLongitude = input.longitude !== undefined && input.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    return { success: false, error: "Select a complete venue location." };
  }
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (hasLatitude) {
    if (
      typeof input.latitude !== "number" ||
      typeof input.longitude !== "number" ||
      !isValidGeoCoordinatePair(input.latitude, input.longitude)
    ) {
      return { success: false, error: "Venue coordinates are invalid." };
    }
    latitude = input.latitude;
    longitude = input.longitude;
  }

  return {
    success: true,
    location: {
      venueAddress,
      landmark: landmark || null,
      latitude,
      longitude,
    },
  };
}
