import { useState } from "react";

export default function Logo({ compact = false }) {
  const [imageAvailable, setImageAvailable] = useState(true);

  return (
    <div aria-label="GWE ESPORTS — GRIND WITH EXP" className="flex items-center gap-3">
      {imageAvailable && (
        <img
          alt=""
          className="h-10 w-10 rounded-lg object-contain"
          onError={() => setImageAvailable(false)}
          src="/gwe-logo.png"
        />
      )}
      <div>
        <p className="text-[15px] font-extrabold leading-tight tracking-[0.12em] text-[#f5eee5]">
          GWE <span className="text-[#c35a6b]">ESPORTS</span>
        </p>
        {!compact && (
          <p className="mt-1 text-[9px] font-semibold tracking-[0.27em] text-[#89817c]">
            GRIND WITH EXP
          </p>
        )}
      </div>
    </div>
  );
}
