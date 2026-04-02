import React, { createContext, useContext, useState } from 'react'
import { cn } from '../../lib/utils'

const TabsContext = createContext()

const Tabs = React.forwardRef(({ className, value, onValueChange, defaultValue, ...props }, ref) => {
    const [activeTab, setActiveTab] = useState(defaultValue || value)

    const handleValueChange = (newValue) => {
        setActiveTab(newValue)
        onValueChange?.(newValue)
    }

    return (
        <TabsContext.Provider value={{ activeTab, onValueChange: handleValueChange }}>
            <div ref={ref} className={cn('w-full', className)} {...props} />
        </TabsContext.Provider>
    )
})
Tabs.displayName = 'Tabs'

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            'inline-flex items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
            className
        )}
        {...props}
    />
))
TabsList.displayName = 'TabsList'

const TabsTrigger = React.forwardRef(({ className, value, ...props }, ref) => {
    const { activeTab, onValueChange } = useContext(TabsContext)

    return (
        <button
            ref={ref}
            onClick={() => onValueChange(value)}
            className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                activeTab === value && 'bg-background text-foreground shadow-sm',
                className
            )}
            {...props}
        />
    )
})
TabsTrigger.displayName = 'TabsTrigger'

const TabsContent = React.forwardRef(({ className, value, ...props }, ref) => {
    const { activeTab } = useContext(TabsContext)

    if (activeTab !== value) return null

    return (
        <div
            ref={ref}
            className={cn(
                'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className
            )}
            {...props}
        />
    )
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
