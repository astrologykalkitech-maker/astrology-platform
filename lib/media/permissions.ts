export type MediaPermissionIssue =
  | "unsupported_context"
  | "permission_denied"
  | "device_not_found"
  | "device_in_use"
  | "unknown";

export interface ClassifiedMediaError {
  issue: MediaPermissionIssue;
  title: string;
  message: string;
}

/**
 * Normalizes browser getUserMedia / LiveKit track acquisition errors into
 * actionable, user-facing guidance without exposing raw stack traces.
 */
export function classifyMediaError(
  err: unknown,
  kind: "camera_or_mic" | "microphone" = "camera_or_mic"
): ClassifiedMediaError {
  const errObj = (err && typeof err === "object" ? err : {}) as {
    name?: string;
    message?: string;
  };
  const name = errObj.name || "";
  const msg = (errObj.message || "").toLowerCase();
  const label = kind === "microphone" ? "Microphone" : "Camera or microphone";

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    msg.includes("permission denied") ||
    msg.includes("permission dismissed")
  ) {
    return {
      issue: "permission_denied",
      title: `${label} Permission Blocked`,
      message: `${label} access was denied. Click the lock/camera icon in your browser address bar to allow access, then click Retry.`,
    };
  }

  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    msg.includes("requested device not found")
  ) {
    return {
      issue: "device_not_found",
      title: `No ${label} Detected`,
      message: `No working ${label.toLowerCase()} was found. Connect a device and retry.`,
    };
  }

  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    msg.includes("could not start") ||
    msg.includes("in use")
  ) {
    return {
      issue: "device_in_use",
      title: `${label} Busy`,
      message: `${label} is currently in use by another application or tab. Close the other app and retry.`,
    };
  }

  return {
    issue: "unknown",
    title: `${label} Unavailable`,
    message: errObj.message || `Could not access ${label.toLowerCase()}. Please check your browser permissions.`,
  };
}
