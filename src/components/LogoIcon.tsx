import logoIcon from "@/assets/papi-logo.png";

interface LogoIconProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-[96px] h-auto",
  md: "w-[160px] h-auto",
  lg: "w-[240px] h-auto",
};

export function LogoIcon({ className = "", size = "md" }: LogoIconProps) {
  return (
    <img
      src={logoIcon}
      alt="PAPI HAIR DESIGN"
      width={359} height={142}
      className={`${sizeMap[size]} max-w-full min-w-0 object-contain ${className}`}
    />
  );
}
