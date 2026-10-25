import { cn } from "@/lib/utils"

const Divider = ({ className }: { className?: string }) => (
  <div
    className={cn("mt-1 h-3 w-full", className)}
  />
)

export default Divider
