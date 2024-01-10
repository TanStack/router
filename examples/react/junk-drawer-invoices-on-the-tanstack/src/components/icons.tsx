export function FullFakebooksLogo({
  size,
  position,
}: {
  size: "sm" | "lg";
  position: "left" | "center";
}) {
  const [logoSize, textSize] = {
    sm: [`h-4 w-4`, `text-d-p-sm`],
    lg: [`h-12 w-12`, `text-d-h2`],
  }[size];
  return (
    <div
      className={`flex items-center ${
        position === "center" ? "justify-center" : ""
      } text-[color:#23BF1F]`}
    >
      <FakebooksLogo className={`relative top-[1px] ${logoSize}`} />
      <div className="w-1" />
      <div className={`font-display ${textSize}`}>Fakebooks</div>
    </div>
  );
}

export function FakebooksLogo({ className }: { className: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        fill="#23BF1F"
        fillRule="evenodd"
        d="M12 3a9 9 0 000 18h4.5c1.398 0 2.097 0 2.648-.228a3 3 0 001.624-1.624C21 18.597 21 17.898 21 16.5V12a9 9 0 00-9-9zm-4 8a1 1 0 011-1h6a1 1 0 110 2H9a1 1 0 01-1-1zm3 4a1 1 0 011-1h3a1 1 0 110 2h-3a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} fill="none" {...props}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="m15.75 8.75 3.5 3.25-3.5 3.25M19 12h-8.25M15.25 4.75h-8.5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2h8.5"
      />
    </svg>
  );
}

export function UpRightArrowIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} fill="none" {...props}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M17.25 15.25v-8.5h-8.5M17 7 6.75 17.25"
      />
    </svg>
  );
}

export function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} fill="none" {...props}>
      <path
        d="M12 4.75v1.5M17.127 6.873l-1.061 1.061M19.25 12h-1.5M17.127 17.127l-1.061-1.061M12 17.75v1.5M7.934 16.066l-1.06 1.06M6.25 12h-1.5M7.934 7.934l-1.06-1.06"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
