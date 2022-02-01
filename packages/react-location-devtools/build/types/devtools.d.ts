import React from 'react';
export declare type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
interface DevtoolsOptions {
    /**
     * Set this true if you want the dev tools to default to being open
     */
    initialIsOpen?: boolean;
    /**
     * Use this to add props to the panel. For example, you can add className, style (merge and override default style), etc.
     */
    panelProps?: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
    /**
     * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
     */
    closeButtonProps?: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
    /**
     * Use this to add props to the toggle button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
     */
    toggleButtonProps?: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
    /**
     * The position of the React Location logo to open and close the devtools panel.
     * Defaults to 'bottom-left'.
     */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /**
     * Use this to render the devtools inside a different type of container element for a11y purposes.
     * Any string which corresponds to a valid intrinsic JSX element is allowed.
     * Defaults to 'footer'.
     */
    containerElement?: string | any;
    /**
     * A boolean variable indicating if the "lite" version of the library is being used
     */
    useRouter?: () => unknown;
}
interface DevtoolsPanelOptions {
    /**
     * The standard React style object used to style a component with inline styles
     */
    style?: React.CSSProperties;
    /**
     * The standard React className property used to style a component with classes
     */
    className?: string;
    /**
     * A boolean variable indicating whether the panel is open or closed
     */
    isOpen?: boolean;
    /**
     * A function that toggles the open and close state of the panel
     */
    setIsOpen: (isOpen: boolean) => void;
    /**
     * Handles the opening and closing the devtools panel
     */
    handleDragStart: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    /**
     * A boolean variable indicating if the "lite" version of the library is being used
     */
    useRouter: () => unknown;
}
export declare function ReactLocationDevtools({ initialIsOpen, panelProps, closeButtonProps, toggleButtonProps, position, containerElement: Container, useRouter: useRouterImpl, }: DevtoolsOptions): React.ReactElement | null;
export declare const ReactLocationDevtoolsPanel: React.ForwardRefExoticComponent<DevtoolsPanelOptions & React.RefAttributes<HTMLDivElement>>;
export {};
