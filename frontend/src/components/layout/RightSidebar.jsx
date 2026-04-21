export default function RightSidebar({ children }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[350px] flex-shrink-0 border-l border-border bg-card lg:block">
      <div className="flex h-full flex-col overflow-y-auto p-4">
        <div className="flex flex-1 flex-col gap-4">
          {children}
        </div>
        <div className="mt-auto border-t border-border pt-3 text-[10px] text-muted-foreground">
          <p>&copy; 2026 Rubrix &middot; v1.0.0</p>
          <p>Platformă de evaluare academică</p>
        </div>
      </div>
    </aside>
  )
}
