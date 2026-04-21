import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import LeftSidebar from './LeftSidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen bg-background">
        <div className="hidden md:block">
          <LeftSidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center border-b border-border px-4 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <LeftSidebar mobile onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="ml-3 text-lg font-semibold">Rubrix</span>
          </div>

          <div className="flex min-h-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
