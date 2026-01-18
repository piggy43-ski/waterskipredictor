import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Audit log helper
async function writeAuditLog(supabase: any, entry: {
  actor_type: string;
  actor_id?: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id || null,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      metadata: entry.metadata || {},
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

interface NotificationJob {
  id: string;
  type: string;
  tournament_id: string | null;
  market_id: string | null;
  scheduled_for: string;
  status: string;
  metadata: Record<string, any>;
}

interface NotificationTemplate {
  title: string;
  message: string;
  link: string;
}

// Generate notification content based on job type
function getNotificationContent(
  job: NotificationJob,
  tournament?: { name: string; id: string } | null
): NotificationTemplate {
  switch (job.type) {
    case 'PREDICTION_REMINDER':
      return {
        title: 'Predictions closing soon',
        message: `Entries for ${tournament?.name || 'the tournament'} close in 1 hour.`,
        link: tournament ? `/tournaments/${tournament.id}` : '/tournaments',
      };
    case 'NEW_TOURNAMENT':
      return {
        title: 'New tournament is live',
        message: `${tournament?.name || 'A new tournament'} is now open for predictions.`,
        link: tournament ? `/tournaments/${tournament.id}` : '/tournaments',
      };
    case 'REWARD_AVAILABLE':
      return {
        title: 'You can redeem rewards',
        message: 'Check the Rewards catalog for gear & experiences.',
        link: '/rewards',
      };
    case 'PROMO':
      return {
        title: job.metadata?.title || 'New promotion',
        message: job.metadata?.message || 'Check out our latest offer!',
        link: job.metadata?.link || '/',
      };
    default:
      return {
        title: 'Notification',
        message: 'You have a new notification.',
        link: '/',
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log('🔔 Processing notification jobs...');

    // Get pending jobs that are due
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('notification_jobs')
      .select('*')
      .eq('status', 'PENDING')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (jobsError) {
      console.error('❌ Error fetching jobs:', jobsError);
      return new Response(
        JSON.stringify({ error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('✅ No pending notification jobs');
      return new Response(
        JSON.stringify({ processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${pendingJobs.length} pending jobs`);

    let totalNotificationsSent = 0;
    const processedJobs: string[] = [];
    const failedJobs: string[] = [];

    for (const job of pendingJobs as NotificationJob[]) {
      try {
        console.log(`⚙️ Processing job ${job.id} (${job.type})`);

        // Get tournament info if applicable
        let tournament: { id: string; name: string } | null = null;
        if (job.tournament_id) {
          const { data: tournamentData } = await supabase
            .from('tournaments')
            .select('id, name')
            .eq('id', job.tournament_id)
            .single();
          tournament = tournamentData;
        }

        // Determine target users based on job type
        let targetUserIds: string[] = [];

        if (job.type === 'PREDICTION_REMINDER') {
          // Users with balance > 0 who have placed bets or are active
          const { data: activeUsers } = await supabase
            .from('token_wallets')
            .select('user_id')
            .gt('earned_tokens', 0);
          
          if (activeUsers) {
            // Filter by users who have prediction_reminders enabled
            const userIds = activeUsers.map(u => u.user_id);
            const { data: prefs } = await supabase
              .from('email_preferences')
              .select('user_id')
              .in('user_id', userIds)
              .eq('prediction_reminders', true);
            
            targetUserIds = prefs?.map(p => p.user_id) || userIds;
          }
        } else if (job.type === 'NEW_TOURNAMENT') {
          // All active users who have promo_notifications enabled
          const { data: allUsers } = await supabase
            .from('profiles')
            .select('id');
          
          if (allUsers) {
            const userIds = allUsers.map(u => u.id);
            const { data: prefs } = await supabase
              .from('email_preferences')
              .select('user_id')
              .in('user_id', userIds)
              .eq('promo_notifications', true);
            
            targetUserIds = prefs?.map(p => p.user_id) || userIds;
          }
        } else if (job.type === 'REWARD_AVAILABLE' && job.metadata?.user_id) {
          // Specific user
          targetUserIds = [job.metadata.user_id];
        } else if (job.type === 'PROMO') {
          // All users with promo_notifications enabled
          const { data: prefs } = await supabase
            .from('email_preferences')
            .select('user_id')
            .eq('promo_notifications', true);
          
          targetUserIds = prefs?.map(p => p.user_id) || [];
        }

        if (targetUserIds.length === 0) {
          console.log(`⚠️ No target users for job ${job.id}`);
          // Mark job as sent with 0 notifications
          await supabase
            .from('notification_jobs')
            .update({ status: 'SENT', updated_at: new Date().toISOString() })
            .eq('id', job.id);
          processedJobs.push(job.id);
          continue;
        }

        console.log(`👥 Sending to ${targetUserIds.length} users`);

        // Generate notification content
        const content = getNotificationContent(job, tournament);

        // Create notifications in batch
        const notifications = targetUserIds.map(userId => ({
          user_id: userId,
          type: job.type,
          title: content.title,
          message: content.message,
          link: content.link,
          read: false,
          metadata: {
            job_id: job.id,
            tournament_id: job.tournament_id,
            market_id: job.market_id,
          },
        }));

        // Insert in batches of 100
        const batchSize = 100;
        let insertedCount = 0;
        for (let i = 0; i < notifications.length; i += batchSize) {
          const batch = notifications.slice(i, i + batchSize);
          const { error: insertError } = await supabase
            .from('notifications')
            .insert(batch);
          
          if (insertError) {
            console.error(`❌ Error inserting notifications batch:`, insertError);
          } else {
            insertedCount += batch.length;
          }
        }

        totalNotificationsSent += insertedCount;

        // Update job status
        await supabase
          .from('notification_jobs')
          .update({ 
            status: 'SENT', 
            updated_at: new Date().toISOString(),
            metadata: {
              ...job.metadata,
              users_notified: insertedCount,
              sent_at: new Date().toISOString(),
            }
          })
          .eq('id', job.id);

        processedJobs.push(job.id);

        // Write audit log
        await writeAuditLog(supabase, {
          actor_type: 'system',
          action_type: 'NOTIFICATION_JOB_SENT',
          entity_type: 'notification_job',
          entity_id: job.id,
          metadata: {
            type: job.type,
            users_notified: insertedCount,
            tournament_id: job.tournament_id,
          },
        });

        console.log(`✅ Job ${job.id} completed: ${insertedCount} notifications sent`);

      } catch (jobError) {
        console.error(`❌ Error processing job ${job.id}:`, jobError);
        
        // Mark job as failed
        await supabase
          .from('notification_jobs')
          .update({ 
            status: 'FAILED', 
            updated_at: new Date().toISOString(),
            metadata: {
              ...job.metadata,
              error: jobError instanceof Error ? jobError.message : 'Unknown error',
            }
          })
          .eq('id', job.id);

        failedJobs.push(job.id);
      }
    }

    console.log(`\n🎉 Processing complete:`);
    console.log(`   ✅ ${processedJobs.length} jobs processed`);
    console.log(`   🔔 ${totalNotificationsSent} notifications sent`);
    console.log(`   ❌ ${failedJobs.length} jobs failed`);

    return new Response(
      JSON.stringify({
        processed: processedJobs.length,
        notifications_sent: totalNotificationsSent,
        failed: failedJobs.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Process notification jobs error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
