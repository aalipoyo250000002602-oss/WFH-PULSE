'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme()

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            // Keep notifications below the notch on phones and tablets.
            offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}
            mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                } as React.CSSProperties
            }
            {...props}
        />
    )
}

export { Toaster }
