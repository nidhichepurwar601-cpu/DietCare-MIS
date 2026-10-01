import { createContext, useContext } from "react";

export const LayoutContext = createContext(null);

export function useAppLayout() {
  return (
    useContext(LayoutContext) || {
      mobileNavOpen: false,
      setMobileNavOpen: () => {},
      searchOpen: false,
      setSearchOpen: () => {},
    }
  );
}
