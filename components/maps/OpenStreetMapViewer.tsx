"use client";

import React, { useState } from "react";
import { MapPin, Navigation, Compass, ExternalLink } from "lucide-react";

interface OpenStreetMapViewerProps {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  landmark?: string | null;
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
}

export function OpenStreetMapViewer({
  latitude,
  longitude,
  address,
  landmark,
  interactive = false,
  onLocationSelect,
}: OpenStreetMapViewerProps) {
  // Default to central India coords if lat/lng not specified
  const lat = latitude || 28.6139; // New Delhi
  const lng = longitude || 77.209;

  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`;
  const navigationUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${lat}%2C${lng}`;

  return (
    <div className="rounded-2xl border border-gold/25 bg-white overflow-hidden shadow-xs space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gold-deep" />
          <span className="font-semibold text-xs text-midnight">
            Event Venue Location (OpenStreetMap)
          </span>
        </div>
        <a
          href={navigationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-gold-deep hover:underline"
        >
          <span>Open Navigation</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Embedded OpenStreetMap Iframe */}
      <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden border border-gold/20 bg-gray-100 relative">
        <iframe
          title="OpenStreetMap Location"
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          marginHeight={0}
          marginWidth={0}
          src={osmEmbedUrl}
          className="w-full h-full"
        />
      </div>

      {/* Address & Landmark Information */}
      <div className="text-xs space-y-1">
        {address && (
          <p className="text-ink font-medium">
            <span className="text-muted">Venue Address:</span> {address}
          </p>
        )}
        {landmark && (
          <p className="text-muted text-[11px]">
            <span className="font-semibold text-ink">Landmark:</span> {landmark}
          </p>
        )}
        <p className="text-[10px] text-muted font-mono">
          Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      </div>
    </div>
  );
}
