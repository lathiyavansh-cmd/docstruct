// Source: animate-ui (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   A helper that creates a React context plus a hook to read it; the hook throws a clear error if a
 *   component is used outside its provider. It draws nothing on screen itself.
 *
 * Why it exists
 *   The tooltip uses four separate contexts; this turns a silent "undefined" bug (a tooltip part placed
 *   outside its provider) into an error that names the missing provider. The team writes every feature itself
 *   (the professor's no-external-API rule); this open-source piece only affects looks, so it was copied in
 *   rather than built from scratch.
 *
 * Where it fits
 *   Used by: components/animate-ui/primitives/animate/tooltip.tsx. It only supports the tooltip's appearance;
 *   no feature logic.
 */
import * as React from 'react';

function getStrictContext<T>(
  name?: string,
): readonly [
  ({
    value,
    children,
  }: {
    value: T;
    children?: React.ReactNode;
  }) => React.JSX.Element,
  () => T,
] {
  const Context = React.createContext<T | undefined>(undefined);

  const Provider = ({
    value,
    children,
  }: {
    value: T;
    children?: React.ReactNode;
  }) => <Context.Provider value={value}>{children}</Context.Provider>;

  const useSafeContext = () => {
    const ctx = React.useContext(Context);
    if (ctx === undefined) {
      throw new Error(`useContext must be used within ${name ?? 'a Provider'}`);
    }
    return ctx;
  };

  return [Provider, useSafeContext] as const;
}

export { getStrictContext };
