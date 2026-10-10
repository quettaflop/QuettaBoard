/** A schematic of ordinary GPU hardware, rather than a product rendering. */
export function HardwareIllustration() {
  return (
    <svg className="hardware-illustration" viewBox="0 0 560 550" fill="none" aria-hidden="true">
      <defs>
        <pattern id="hardware-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--ink)" opacity=".15" />
        </pattern>
        <g id="gpu-board" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round">
          <path d="m92 224 183-106 191 110-183 106Z" fill="var(--art-board)" />
          <path d="m92 224 191 110v25L92 249Z" fill="var(--art-side)" />
          <path d="m283 334 183-106v25L283 359Z" fill="var(--ink)" />
          <path d="m120 224 155-89 163 93-155 90Z" stroke="var(--art-trace)" strokeWidth="1.5" />
          <path d="m158 223 55-32m129-1 56 32m-154 56-24 14m105-14 24 14" stroke="var(--art-trace)" />
          <path d="m207 219 69-40 76 44-69 40Z" fill="var(--ink)" />
          <path d="m207 219 76 44v15l-76-44Z" fill="var(--art-side)" />
          <path d="m283 263 69-40v15l-69 40Z" fill="var(--ink)" />
          <path d="m232 219 44-25 50 29-43 25Z" fill="var(--art-chip)" stroke="var(--art-chip)" />
          <path d="m146 237 24-14 25 15-24 14Zm220 9 24-14 25 14-24 14Z" fill="var(--bg)" />
          <path d="m120 250 22 13m-22-3 22 13m260 23 24-14m-24 24 24-14" stroke="var(--bg)" strokeWidth="3" />
        </g>
      </defs>
      <circle cx="280" cy="275" r="220" fill="url(#hardware-dots)" />
      <path d="m50 351 225 132 237-137" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 7" opacity=".35" />
      <path d="m57 364 219 127 241-138" stroke="var(--ink)" strokeWidth="1.5" opacity=".15" />
      <use href="#gpu-board" transform="translate(0 110)" />
      <use href="#gpu-board" transform="translate(0 40)" />
      <use href="#gpu-board" transform="translate(0 -30)" />
      <g stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M80 132v-25m-12 12h25M450 398v-20m-10 10h20" />
        <circle cx="445" cy="109" r="7" fill="var(--art-chip)" />
        <circle cx="73" cy="404" r="5" />
        <path d="m382 88 7-4m-2 11 7-4" />
      </g>
      <g fontFamily="var(--mono)" fontSize="11" fill="var(--ink-2)">
        <text x="341" y="75">OPEN MODELS</text>
        <path d="m373 83-38 24" stroke="var(--ink-3)" />
        <text x="52" y="455">REAL HARDWARE</text>
        <path d="m151 447 40-24" stroke="var(--ink-3)" />
      </g>
    </svg>
  );
}
