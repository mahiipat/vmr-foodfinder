"use client";
import { ALL_DIETARY_TAGS, dietaryLabels, type DietaryTag } from "../../lib/dietary";

type Props = {
    selected: DietaryTag[];
    onChange: (next: DietaryTag[]) => void;
    disabled?: boolean;
};

export default function DietaryNeedsPicker({ selected, onChange, disabled }: Props) {
    function toggle(tag: DietaryTag) {
        onChange(selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]);
    }

    return (
        <div className="mt-10">
            <h3 className="font-serif text-2xl"> Dietary needs. </h3>
            <p className="mt-2 text-sm text-[#68665A]"> Optional. Leave blank if you can eat anywhere. </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
                {ALL_DIETARY_TAGS.map((tag) => (
                    <label key={tag} className="flex items-center gap-3 border border-[#343329]/20 px-4 py-3">
                        <input
                            type="checkbox"
                            checked={selected.includes(tag)}
                            disabled={disabled}
                            onChange={() => toggle(tag)}
                        />
                        <span className="text-sm">{dietaryLabels[tag]}</span>
                    </label>
                ))}
            </div>

            <p className="mt-3 text-xs leading-5 text-[#777466]">
                Dietary info comes from Yelp and is often incomplete. Restaurants we can&apos;t confirm stay
                on the list marked &quot;unknown&quot;, so always check allergies with the restaurant.
            </p>
        </div>
    );
}
