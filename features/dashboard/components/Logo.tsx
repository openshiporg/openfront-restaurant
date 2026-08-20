import { cn } from "@/lib/utils";
import { Syne } from "next/font/google";
import { LogoIcon } from "./LogoIcon";

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

interface LogoProps {
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}

export const Logo = ({
  className,
  textClassName,
  iconClassName,
}: LogoProps) => {
  return (
    <div className={cn(className, "flex items-center gap-3 text-left")}>
      <LogoIcon className={cn("size-8 shrink-0", iconClassName)} color="#f59e0b" suffix="-full" />
      <div className="flex flex-col justify-center -mt-1">
        <span
          className={cn(
            syne.className,
            textClassName,
            "text-xl font-semibold tracking-tight text-foreground",
          )}
        >
          open<span className="font-normal">front</span>
        </span>
        <span
          className={cn(
            syne.className,
            "text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
          )}
        >
          Restaurant
        </span>
      </div>
    </div>
  );
};

export { LogoIcon };
