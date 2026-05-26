import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'
import rubrixLogo from '@/assets/rubrix-logo.svg'
import {
  LayoutDashboard,
  PlusCircle,
  BarChart3,
  FileText,
  User,
  Sun,
  Moon,
  LogOut,
  Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default function LeftSidebar({ mobile = false, onNavigate }) {
  const { user, isProfessor, theme, toggleTheme, logout, avatarUrl } = useApp()
  const location = useLocation()
  const navigate = useNavigate()

  const initials = (user?.full_name || user?.email || '?')
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ...(isProfessor
      ? [
          { path: '/assessment/new', label: 'Evaluare nouă', icon: PlusCircle },
          { path: '/chat', label: 'Asistent AI', icon: Bot },
        ]
      : []),
    { path: '/analytics', label: 'Analize', icon: BarChart3 },
    ...(!isProfessor
      ? [{ path: '/my-responses', label: 'Răspunsurile mele', icon: FileText }]
      : []),
    { path: '/profile', label: 'Profil', icon: User },
  ]

  const handleNav = (path) => {
    navigate(path)
    onNavigate?.()
  }

  const showLabels = mobile

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card py-4',
        mobile ? 'w-full' : 'sticky top-0 w-[72px] items-center xl:w-[260px]'
      )}
    >
      <div
        className={cn(
          'mb-6 flex cursor-pointer items-center gap-3 px-4',
          !mobile && 'justify-center xl:justify-start'
        )}
        onClick={() => handleNav('/')}
      >
        <img
          src={rubrixLogo}
          alt="Rubrix"
          className="h-9 w-9 flex-shrink-0"
          style={theme === 'dark' ? {
            filter: 'brightness(0) saturate(100%) invert(30%) sepia(90%) saturate(2500%) hue-rotate(320deg) brightness(90%) contrast(100%)',
          } : undefined}
        />
        {(showLabels || true) && (
          <span className={cn('text-lg font-semibold', !mobile && 'hidden xl:inline')}>
            Rubrix
          </span>
        )}
      </div>

      <nav className={cn('flex w-full flex-1 flex-col gap-1', mobile ? 'px-3' : 'px-2')}>
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path)
          const Icon = item.icon

          if (mobile) {
            return (
              <Button
                key={item.path}
                variant={isActive ? 'default' : 'ghost'}
                className={cn('w-full justify-start gap-3', isActive && 'font-semibold')}
                onClick={() => handleNav(item.path)}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Button>
            )
          }

          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  className={cn(
                    'w-full justify-center xl:justify-start gap-3',
                    isActive && 'font-semibold'
                  )}
                  onClick={() => handleNav(item.path)}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="hidden xl:inline">{item.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="xl:hidden">
                {item.label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <div className={cn('mt-auto flex w-full flex-col gap-1', mobile ? 'px-3' : 'px-2')}>
        <Separator className="mb-2" />

        {mobile ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span>{theme === 'dark' ? 'Temă deschisă' : 'Temă întunecată'}</span>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-center xl:justify-start gap-3"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun className="h-5 w-5 flex-shrink-0" /> : <Moon className="h-5 w-5 flex-shrink-0" />}
                <span className="hidden xl:inline">
                  {theme === 'dark' ? 'Temă deschisă' : 'Temă întunecată'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="xl:hidden">
              {theme === 'dark' ? 'Temă deschisă' : 'Temă întunecată'}
            </TooltipContent>
          </Tooltip>
        )}

        {mobile ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={() => handleNav('/profile')}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium leading-none">
                {user?.full_name || 'Utilizator'}
              </span>
              <span className="text-xs text-muted-foreground">
                {isProfessor ? 'Profesor' : 'Student'}
              </span>
            </div>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-center xl:justify-start gap-3"
                onClick={() => handleNav('/profile')}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden flex-col items-start xl:flex">
                  <span className="text-sm font-medium leading-none">
                    {user?.full_name || 'Utilizator'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isProfessor ? 'Profesor' : 'Student'}
                  </span>
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="xl:hidden">
              {user?.full_name || 'Profil'}
            </TooltipContent>
          </Tooltip>
        )}

        {mobile ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => { logout(); onNavigate?.() }}
          >
            <LogOut className="h-5 w-5" />
            <span>Deconectare</span>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive xl:justify-start xl:gap-3"
                onClick={logout}
              >
                <LogOut className="h-5 w-5" />
                <span className="hidden xl:inline">Deconectare</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="xl:hidden">
              Deconectare
            </TooltipContent>
          </Tooltip>
        )}

      </div>
    </aside>
  )
}
