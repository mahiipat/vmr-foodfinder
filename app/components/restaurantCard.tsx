"use client";
import type { ReactNode } from "react";
import type { Restaurant } from "../../backend/AppBackend";
import { dietaryLabels, type DietaryTag } from "../../lib/dietary";
import { placePhotoUrl } from "../../lib/places";

type Props = {
    restaurant: Restaurant;
    // "large" is the winner on the results page, "small" is everything else
    size?: "large" | "small";
    // everything anyone in the group selected, so each card can say listed vs unknown
    dietaryNeeds?: DietaryTag[];
    rank?: number;
    footer?: ReactNode;
};

export default function RestaurantCard({ restaurant, size = "small", dietaryNeeds = [], rank, footer }: Props) {
    const large = size === "large";
    const details = [
        restaurant.cuisine,
        restaurant.priceLabel,
        restaurant.distanceMiles !== null ? `${restaurant.distanceMiles.toFixed(1)} mi away` : "",
    ].filter(Boolean);

    return (
        <div className={`overflow-hidden border border-[#343329]/20 bg-white/20 ${large ? "text-left" : ""}`}>
            <Photo restaurant={restaurant} large={large} />

            <div className={large ? "p-8" : "p-5"}>
                <h3 className={`font-serif ${large ? "text-5xl sm:text-6xl" : "text-2xl"}`}>
                    {rank !== undefined && <span className="text-[#777466]">{String(rank).padStart(2, "0")} / </span>}
                    {restaurant.name}
                </h3>
                <p className={`mt-3 text-[#68665A] ${large ? "text-sm" : "text-xs"}`}>{details.join(" · ")}</p>
                <p className="mt-2 text-xs text-[#777466]">
                    {restaurant.reviewCount > 0
                        ? `★ ${restaurant.rating.toFixed(1)} (${restaurant.reviewCount.toLocaleString()} Google reviews)`
                        : "No Google ratings yet"}
                </p>
                {restaurant.address && <p className="mt-2 text-xs text-[#777466]">{restaurant.address}</p>}

                <DietaryInfo restaurant={restaurant} needs={dietaryNeeds} />

                <div className="mt-4 flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.18em]">
                    {restaurant.mapsUrl && (
                        <a href={restaurant.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline">
                            {large ? "Directions" : "Map"}
                        </a>
                    )}
                    {/^https?:\/\//i.test(restaurant.website ?? "") && (
                        <a href={restaurant.website} target="_blank" rel="noopener noreferrer" className="underline">
                            Website
                        </a>
                    )}
                    {restaurant.yelpUrl && (
                        <a href={restaurant.yelpUrl} target="_blank" rel="noopener noreferrer" className="underline">
                            Yelp
                        </a>
                    )}
                </div>

                {footer}
            </div>
        </div>
    );
}

function Photo({ restaurant, large }: { restaurant: Restaurant; large: boolean }) {
    const height = large ? "h-72" : "h-36";
    if (!restaurant.photoName) {
        return (
            <div className={`flex ${height} items-center justify-center bg-[#343329]/10 font-serif text-5xl text-[#777466]`}>
                {restaurant.name.charAt(0).toUpperCase()}
            </div>
        );
    }
    return (
        // plain <img>: the photo comes from our own redirect route, which next/image can't optimize
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={placePhotoUrl(restaurant.photoName, large ? 1000 : 400)}
            alt={restaurant.name}
            loading="lazy"
            className={`${height} w-full object-cover`}
        />
    );
}

function DietaryInfo({ restaurant, needs }: { restaurant: Restaurant; needs: DietaryTag[] }) {
    const tags = restaurant.dietaryTags ?? [];

    // nobody in the group has dietary needs: just show what Yelp lists, if anything
    if (needs.length === 0) {
        if (tags.length === 0) return null;
        return (
            <p className="mt-3 text-xs text-[#566B48]">
                Yelp lists: {tags.map((tag) => dietaryLabels[tag]).join(", ")}
            </p>
        );
    }

    return (
        <div className="mt-3 flex flex-wrap gap-2">
            {needs.map((need) => {
                const listed = tags.includes(need);
                return (
                    <span
                        key={need}
                        title={listed ? "Listed on Yelp" : "Not listed on Yelp. Check with the restaurant."}
                        className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.12em] ${listed ? "bg-[#E4E8D8] text-[#566B48]" : "bg-[#343329]/10 text-[#777466]"}`}
                    >
                        {listed ? "✓" : "?"} {dietaryLabels[need]}{listed ? "" : " unknown"}
                    </span>
                );
            })}
        </div>
    );
}
