import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubscribeRequest {
  email: string;
  userId?: string;
  firstName?: string;
  tags?: string[];
  source?: string;
  marketingOptIn?: boolean;
}

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: SubscribeRequest = await req.json();
    const { email, userId, firstName, tags = [], source = "signup", marketingOptIn } = body;

    console.log("Subscribe request received:", { email, userId, source, marketingOptIn });

    // Validate email format
    if (!email || !emailRegex.test(email)) {
      console.log("Invalid email format:", email);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check consent - if not provided or false, log and return early
    if (!marketingOptIn) {
      console.log("Marketing consent not given, skipping subscription");
      
      // Log the skipped attempt
      await supabase.from("email_subscriptions").insert({
        email,
        user_id: userId || null,
        subscribed: false,
        tags: [],
        source,
        error_message: "No marketing consent"
      });

      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No marketing consent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all audiences from Resend
    const audiencesResponse = await fetch("https://api.resend.com/audiences", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!audiencesResponse.ok) {
      const errorText = await audiencesResponse.text();
      throw new Error(`Failed to fetch audiences: ${errorText}`);
    }

    const audiencesData = await audiencesResponse.json();
    console.log("Audiences found:", audiencesData);

    // Use the first audience (or find "WaterSki Predictor Users" if it exists)
    let audienceId: string | null = null;
    
    if (audiencesData.data && audiencesData.data.length > 0) {
      // Try to find our specific audience first
      const waterskiAudience = audiencesData.data.find(
        (a: any) => a.name === "WaterSki Predictor Users"
      );
      
      if (waterskiAudience) {
        audienceId = waterskiAudience.id;
      } else {
        // Use the first available audience
        audienceId = audiencesData.data[0].id;
      }
    }

    if (!audienceId) {
      throw new Error("No audiences found in Resend account");
    }

    console.log("Using audience ID:", audienceId);

    // Check if contact already exists
    const searchResponse = await fetch(
      `https://api.resend.com/audiences/${audienceId}/contacts?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let contactId: string | null = null;
    let isUpdate = false;

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log("Search result:", searchData);
      
      // Check if contact exists
      if (searchData.data && searchData.data.length > 0) {
        contactId = searchData.data[0].id;
        isUpdate = true;
        console.log("Existing contact found:", contactId);
      }
    }

    // Prepare tags
    const finalTags = [...new Set(["registered-user", "beta-user", ...tags])];

    if (isUpdate && contactId) {
      // Update existing contact
      const updateResponse = await fetch(
        `https://api.resend.com/audiences/${audienceId}/contacts/${contactId}`,
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            first_name: firstName || undefined,
            unsubscribed: false,
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Failed to update contact:", errorText);
        // Don't throw - log and continue
      } else {
        console.log("Contact updated successfully");
      }
    } else {
      // Create new contact
      const createResponse = await fetch(
        `https://api.resend.com/audiences/${audienceId}/contacts`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            first_name: firstName || undefined,
            unsubscribed: false,
          }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create contact: ${errorText}`);
      }

      const createData = await createResponse.json();
      contactId = createData.id;
      console.log("Contact created:", contactId);
    }

    // Log successful subscription
    await supabase.from("email_subscriptions").insert({
      email,
      user_id: userId || null,
      audience_id: audienceId,
      contact_id: contactId,
      subscribed: true,
      tags: finalTags,
      source,
    });

    console.log("Subscription logged successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId, 
        audienceId,
        isUpdate 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Subscription error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Try to log the error (don't let this fail the response)
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const body = await req.clone().json().catch(() => ({}));
      
      await supabase.from("email_subscriptions").insert({
        email: body.email || "unknown",
        user_id: body.userId || null,
        subscribed: false,
        source: body.source || "signup",
        error_message: errorMessage,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    // Always return success to not block signup
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
