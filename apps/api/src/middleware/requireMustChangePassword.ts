import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from './errorHandler.js';
import { getRbacRepository } from '../services/permissionResolver.js';

export async function requireMustChangePassword(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.session) {
    return next();
  }

  // Allowed endpoints while mustChangePassword is true
  const allowedPaths = ['/change-password', '/auth/change-password', '/api/v1/auth/change-password', '/logout', '/auth/logout', '/api/v1/auth/logout'];
  if (allowedPaths.some((p) => req.path.endsWith(p))) {
    return next();
  }

  const rbacData = await getRbacRepository().getUserRbacData(req.session.staffUserId);
  if (rbacData?.mustChangePassword) {
    return next(
      new ForbiddenError(
        'Password change required: You must change your temporary password before accessing the system.',
        { mustChangePassword: true }
      )
    );
  }

  next();
}
