/** 服务端无真实 DOM，事务调度与锚点 effect 均不启用。 */
export const isServer: boolean =
  typeof window === "undefined" || typeof document === "undefined";
