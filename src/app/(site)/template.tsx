/** Re-mounts on navigation so each page enters with a subtle fade/rise (disabled for reduced motion). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
