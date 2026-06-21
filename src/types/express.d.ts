import { JwtPayload } from '../modules/auth/strategies/jwt.strategy';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends JwtPayload {}
  }
}
