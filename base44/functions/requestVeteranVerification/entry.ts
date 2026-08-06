import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const verifiedStatuses = ['verified_veteran', 'disabled_vet', 'homeless_vet'];
    if (verifiedStatuses.includes(user.veteran_status)) {
      return Response.json({ status: 'verified', message: 'Veteran access is already active.' });
    }
    if (user.veteran_status === 'pending_verification') {
      return Response.json({ status: 'pending_verification', message: 'Your veteran verification is already under review.' });
    }

    // Only legal path for a user to request veteran status: regular -> pending_verification
    await base44.asServiceRole.entities.User.update(user.id, { veteran_status: 'pending_verification' });

    return Response.json({
      status: 'pending_verification',
      message: 'Veteran verification request submitted. An admin will review it shortly.'
    });
  } catch (error) {
    console.error('requestVeteranVerification failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});