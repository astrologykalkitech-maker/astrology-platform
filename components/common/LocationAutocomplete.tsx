"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import {
  MapPin,
  Loader2,
  X,
  Check,
  AlertCircle,
  Navigation,
} from "lucide-react";
import type {
  NormalizedPlaceSuggestion,
  OlaPrediction,
  NormalizedReverseGeocode,
} from "@/lib/location/ola-maps";

export type LocationSuggestion = NormalizedPlaceSuggestion;

export interface LocationAutocompleteProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string, suggestion?: LocationSuggestion) => void;
  onSelectSuggestion?: (suggestion: LocationSuggestion) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  error?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  enableCurrentLocation?: boolean;
  currentLocationLabel?: string;
}

export function LocationAutocomplete({
  id = "location-autocomplete",
  name,
  value,
  onChange,
  onSelectSuggestion,
  placeholder = "Search city or birthplace...",
  className = "",
  inputClassName = "",
  disabled = false,
  required = false,
  label,
  error,
  autoFocus = false,
  ariaLabel,
  enableCurrentLocation = true,
  currentLocationLabel = "Use my current location",
}: LocationAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestIdRef = useRef<number>(0);
  const clientQueryCacheRef = useRef<Map<string, LocationSuggestion[]>>(new Map());
  const listboxId = `${id}-listbox`;

  const clearTemporaryError = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setFetchError(null);
  }, []);

  const showTemporaryError = useCallback((msg: string) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    setFetchError(msg);
    // Auto-dismiss transient location notices after 6 seconds
    errorTimerRef.current = setTimeout(() => {
      setFetchError(null);
      errorTimerRef.current = null;
    }, 6000);
  }, []);

  // Debounced search logic with request cancellation and sequence ID checks
  const fetchSuggestions = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      setHasSearched(false);
      setFetchError(null);
      return;
    }

    // Instant zero-latency render for previously typed prefixes
    const cacheKey = trimmed.toLowerCase();
    const cached = clientQueryCacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setIsOpen(true);
      setLoading(false);
      setHasSearched(true);
      setFetchError(null);
      setActiveIndex(-1);
      return;
    }

    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++lastRequestIdRef.current;

    setLoading(true);
    setHasSearched(true);
    setFetchError(null);

    try {
      // Primary: Official Ola Maps Places Autocomplete endpoint
      const res = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      );

      // Discard stale response if a newer request was dispatched
      if (requestId !== lastRequestIdRef.current) return;

      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as { error?: string } | null;
        setFetchError(errorData?.error || "Could not retrieve suggestions.");
        setSuggestions([]);
        return;
      }

      const data = (await res.json()) as {
        success?: boolean;
        suggestions?: LocationSuggestion[];
        predictions?: OlaPrediction[];
      };

      if (requestId === lastRequestIdRef.current) {
        let results: LocationSuggestion[] = [];
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          results = data.suggestions;
        } else if (Array.isArray(data.predictions)) {
          results = data.predictions.map((p, idx) => ({
            id: p.place_id || p.reference || `ola-${idx}`,
            name: p.structured_formatting?.main_text || p.description.split(",")[0]?.trim() || "Location",
            state: p.structured_formatting?.secondary_text?.split(",")[0]?.trim(),
            country: p.structured_formatting?.secondary_text?.split(",").slice(-1)[0]?.trim() || "India",
            formatted: p.description,
            latitude: p.geometry?.location?.lat,
            longitude: p.geometry?.location?.lng,
            place_id: p.place_id,
            source: "autocomplete",
          }));
        }

        setSuggestions(results);
        setIsOpen(true);
        setActiveIndex(-1);

        // Store up to 50 entries in client memory for instant backspacing and typing
        if (clientQueryCacheRef.current.size >= 50) {
          const oldest = clientQueryCacheRef.current.keys().next().value;
          if (oldest) clientQueryCacheRef.current.delete(oldest);
        }
        clientQueryCacheRef.current.set(cacheKey, results);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Normal cancellation
      }
      if (requestId === lastRequestIdRef.current) {
        setSuggestions([]);
        setFetchError("Network issue fetching location suggestions.");
      }
    } finally {
      if (requestId === lastRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Handle typing with clean 300ms debounce
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    clearTemporaryError();
    onChange(newVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (newVal.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        void fetchSuggestions(newVal);
      }, 300);
    } else {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Select suggestion handler
  const handleSelect = (suggestion: LocationSuggestion) => {
    onChange(suggestion.formatted, suggestion);
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
    }
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setFetchError(null);
    inputRef.current?.focus();
  };

  // Full Keyboard navigation support (ArrowDown, ArrowUp, Enter, Escape, Tab)
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && value.trim().length >= 2) {
        e.preventDefault();
        void fetchSuggestions(value);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;

      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;

      case "Enter":
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          e.preventDefault();
          handleSelect(suggestions[activeIndex]);
        }
        break;

      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;

      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const handleClear = () => {
    clearTemporaryError();
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    inputRef.current?.focus();
  };

  // Helper to apply detected location to form inputs seamlessly
  const applyDetectedLocation = (loc: NormalizedReverseGeocode) => {
    const isCityField =
      (currentLocationLabel && currentLocationLabel.toLowerCase().includes("city")) ||
      (id && id.toLowerCase().includes("city"));
    const cityName = loc.city || loc.name || loc.formatted_address.split(",")[0].trim();
    const primaryValue = isCityField ? cityName : loc.formatted_address;

    const suggestion: LocationSuggestion = {
      id: `geo-${loc.latitude.toFixed(4)}-${loc.longitude.toFixed(4)}`,
      name: cityName,
      state: loc.state,
      country: loc.country,
      formatted: loc.formatted_address,
      latitude: loc.latitude,
      longitude: loc.longitude,
      source: "geolocation",
    };

    onChange(primaryValue, suggestion);
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
    }
    setIsOpen(false);
    setSuggestions([]);
    clearTemporaryError();
    setDetectingLocation(false);
  };

  // Resilient multi-layer IP location fallback
  const tryFallbackIpLocation = async (): Promise<boolean> => {
    // 1. Try internal server API route with multi-provider pool
    try {
      const ipRes = await fetch("/api/places/ip-location", {
        signal: AbortSignal.timeout(5000),
      });
      if (ipRes.ok) {
        const ipData = (await ipRes.json()) as {
          success?: boolean;
          result?: NormalizedReverseGeocode;
        };
        if (ipData.success && ipData.result) {
          applyDetectedLocation(ipData.result);
          return true;
        }
      }
    } catch {
      // Continue to direct client fallback
    }

    // 2. Direct browser CORS fallback to BigDataCloud (fast, 0ms server latency)
    try {
      const bdcRes = await fetch(
        "https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en",
        { signal: AbortSignal.timeout(4000) }
      );
      if (bdcRes.ok) {
        const d = await bdcRes.json();
        if (d && (d.city || d.locality)) {
          const city = String(d.city || d.locality).trim();
          const state = String(d.principalSubdivision || "").trim();
          const country = String(d.countryName || "India").trim();
          const loc: NormalizedReverseGeocode = {
            formatted_address: [city, state, country].filter(Boolean).join(", "),
            name: city,
            city,
            state,
            country,
            postal_code: d.postcode || undefined,
            latitude: Number(d.latitude) || 28.6139,
            longitude: Number(d.longitude) || 77.209,
            source: "geolocation",
          };
          applyDetectedLocation(loc);
          return true;
        }
      }
    } catch {
      // Continue to direct CORS fallback to ipwho.is
    }

    // 3. Direct browser CORS fallback to ipwho.is
    try {
      const directRes = await fetch("https://ipwho.is/", {
        signal: AbortSignal.timeout(4000),
      });
      if (directRes.ok) {
        const d = await directRes.json();
        if (d && d.city) {
          const city = String(d.city).trim();
          const state = String(d.region || "").trim();
          const country = String(d.country || "India").trim();
          const loc: NormalizedReverseGeocode = {
            formatted_address: [city, state, country].filter(Boolean).join(", "),
            name: city,
            city,
            state,
            country,
            postal_code: d.postal,
            latitude: Number(d.latitude) || 28.6139,
            longitude: Number(d.longitude) || 77.209,
            source: "geolocation",
          };
          applyDetectedLocation(loc);
          return true;
        }
      }
    } catch {
      // Fall through
    }

    return false;
  };

  // "Use my current location" Geolocation Handler
  const handleCurrentLocation = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDetectingLocation(true);
    clearTemporaryError();

    const hasExistingValue = Boolean(value && value.trim().length > 0);
    let resolvedAccurateGps = false;

    // Fast-fallback timer: if GPS takes more than 3.5 seconds on desktop/laptops,
    // seamlessly provide IP-based approximate location as an interim fallback
    // BUT allow subsequent accurate GPS arrival to upgrade coordinates!
    const ipFallbackTimer = setTimeout(() => {
      if (!resolvedAccurateGps) {
        void tryFallbackIpLocation();
      }
    }, 3500);

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      clearTimeout(ipFallbackTimer);
      const ipResolved = await tryFallbackIpLocation();
      if (!ipResolved) {
        setDetectingLocation(false);
        showTemporaryError("Geolocation is not supported by your browser.");
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(ipFallbackTimer);
        const { latitude, longitude } = position.coords;

        try {
          // Call our server-side Ola Maps reverse geocoding proxy
          const res = await fetch(
            `/api/places/reverse-geocode?lat=${latitude}&lng=${longitude}`,
            { signal: AbortSignal.timeout(6000) }
          );

          if (res.ok) {
            const data = (await res.json()) as {
              success?: boolean;
              result?: NormalizedReverseGeocode;
            };

            if (data.success && data.result) {
              resolvedAccurateGps = true;
              applyDetectedLocation(data.result);
              return;
            }
          }
        } catch {
          // Fallback if reverse geocode endpoint experiences an issue
        }

        if (!resolvedAccurateGps) {
          const ipResolved = await tryFallbackIpLocation();
          if (ipResolved) {
            resolvedAccurateGps = true;
            return;
          }

          // Fallback to coordinate label if reverse geocoding is unavailable
          const fallbackStr = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
          onChange(fallbackStr, {
            id: `geo-coords`,
            name: "Current Location",
            country: "India",
            formatted: fallbackStr,
            latitude,
            longitude,
            source: "geolocation",
          });
          resolvedAccurateGps = true;
          setDetectingLocation(false);
        }
      },
      async (geoError) => {
        clearTimeout(ipFallbackTimer);
        if (resolvedAccurateGps) return;

        // Attempt fast IP-based approximate location fallback if device GPS times out or is unavailable
        const ipResolved = await tryFallbackIpLocation();
        if (ipResolved) {
          return;
        }

        setDetectingLocation(false);

        // If the user already has a manually entered or saved value (e.g. "Varanasi"),
        // never show a misleading "timed out, type manually" error!
        if (hasExistingValue) {
          return;
        }

        let msg = "Could not detect your current location.";
        if (geoError.code === 1) {
          msg = "Location permission denied. Please allow location access in your browser settings.";
        } else if (geoError.code === 2) {
          msg = "Position unavailable. Please search manually by city.";
        } else if (geoError.code === 3) {
          msg = "Location request timed out. Please try again or type manually.";
        }
        showTemporaryError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const displayError = error || (!value ? fetchError : null);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-midnight"
          >
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}

        {enableCurrentLocation && (
          <button
            type="button"
            onClick={handleCurrentLocation}
            disabled={disabled || detectingLocation}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gold-deep hover:text-midnight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded px-1 transition-colors disabled:opacity-50 cursor-pointer"
            title={currentLocationLabel}
          >
            {detectingLocation ? (
              <Loader2 className="h-3 w-3 animate-spin text-gold-deep" />
            ) : (
              <Navigation className="h-3 w-3 text-gold-deep" />
            )}
            <span>{detectingLocation ? "Detecting..." : currentLocationLabel}</span>
          </button>
        )}
      </div>

      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined
          }
          aria-label={ariaLabel || label || "Location"}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled || detectingLocation}
          required={required}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            clearTemporaryError();
            if (suggestions.length > 0) setIsOpen(true);
            else if (value.trim().length >= 2) void fetchSuggestions(value);
          }}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-gold/30 bg-parchment/30 py-2.5 pl-3.5 pr-14 text-xs text-midnight placeholder:text-muted/60 transition-colors focus:border-gold focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold disabled:opacity-50 ${
            error || (fetchError && !value) ? "!border-red-400 focus:!ring-red-400" : ""
          } ${inputClassName}`}
        />

        <div className="absolute right-3 flex items-center gap-1.5 pointer-events-auto">
          {loading || detectingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
          ) : value ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear location input"
              className="p-0.5 text-muted hover:text-midnight transition-colors cursor-pointer rounded-full"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <MapPin className="h-4 w-4 text-gold-deep pointer-events-none" />
          )}
        </div>
      </div>

      {displayError && (
        <div className="text-[11px] text-red-500 mt-1 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
            <span className="truncate">{displayError}</span>
          </div>
          <button
            type="button"
            onClick={clearTemporaryError}
            className="text-muted hover:text-midnight p-0.5 rounded cursor-pointer shrink-0"
            aria-label="Dismiss notice"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-gold/30 bg-white p-1 shadow-xl backdrop-blur-md transition-all"
        >
          {suggestions.length > 0 ? (
            suggestions.map((item, idx) => {
              const isSelected = activeIndex === idx;
              return (
                <li
                  key={item.id}
                  id={`${id}-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    // Prevent input blur before click registers
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-gold/15 text-midnight font-medium"
                      : "text-ink hover:bg-parchment/60"
                  }`}
                >
                  <MapPin
                    className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      isSelected ? "text-gold-deep" : "text-muted"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-midnight truncate">
                      {item.name}
                      {item.state ? (
                        <span className="font-normal text-muted ml-1">
                          ({item.state})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-muted truncate">
                      {item.formatted}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-gold-deep shrink-0 mt-0.5" />
                  )}
                </li>
              );
            })
          ) : hasSearched && !loading ? (
            <li className="px-3 py-3 text-center text-xs text-muted">
              <p className="font-medium text-midnight">No matching locations found</p>
              <p className="text-[10px] text-muted mt-0.5">
                You can keep your custom typed location.
              </p>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
