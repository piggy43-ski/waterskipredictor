import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedParticipant {
  name: string;
  gender: 'male' | 'female';
  discipline?: 'slalom' | 'trick' | 'jump';
  country?: string;
}

interface ParseResponse {
  participants: ParsedParticipant[];
  detected_discipline?: string;
  detected_gender?: string;
  confidence: number;
}

const systemPrompt = `You are an expert at reading waterski tournament participant lists, entry lists, and start lists.

YOUR TASK:
Extract athlete names from the provided document (image, PDF text, or webpage content).

GENDER DETECTION:
- Look for section headers like: "Men's Slalom", "Women's Trick", "Male", "Female", "Open Men", "Open Women"
- Results pages often have separate tables/sections for each gender
- Assign gender to each athlete based on which section they appear in
- If gender is unclear, make your best guess based on name patterns or mark as "male" by default

DISCIPLINE DETECTION - CRITICAL:
- ONLY return one of these EXACT values: "slalom", "trick", "jump"
- Do NOT return "waterski" - this is the sport name, NOT a valid discipline
- Do NOT return "overall" or any other discipline name
- Look for: "Slalom", "Trick", "Jump" in headers or section titles
- If a document covers multiple disciplines, note which discipline each athlete is listed under
- If only one discipline is visible, apply it to all athletes
- If you cannot determine a specific discipline (slalom, trick, or jump), set discipline to null

NAME EXTRACTION RULES:
- Extract full names as they appear
- Handle formats like "SMITH, John" → "John Smith" (convert to natural order)
- Handle formats like "J. Smith" → keep as is
- Remove country codes if attached to names
- Look for country separately if available (e.g., "USA", "GBR", "FRA")

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "participants": [
    {
      "name": "John Smith",
      "gender": "male",
      "discipline": "slalom",
      "country": "USA"
    }
  ],
  "detected_discipline": "slalom",
  "detected_gender": "male",
  "confidence": 0.95
}

CONFIDENCE SCORING:
- 0.95+ if clear section headers for gender/discipline
- 0.80-0.94 if some ambiguity but most names clear
- 0.60-0.79 if significant guessing required

IMPORTANT: Only return the JSON object, no markdown or extra text.`;

async function fetchWebpage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WaterskiBot/1.0)'
      }
    });
    const html = await response.text();
    // Strip HTML tags for cleaner text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 15000); // Limit text length
  } catch (error) {
    console.error('Error fetching webpage:', error);
    throw new Error(`Failed to fetch webpage: ${url}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('User is not an admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const { files } = await req.json();
    
    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build content array for the AI
    const contentParts: any[] = [
      { type: 'text', text: 'Extract participant names from the following document(s). Look for entry lists, start lists, or registration information.' }
    ];

    for (const file of files) {
      if (file.type === 'url') {
        // Fetch webpage content
        console.log('Fetching webpage:', file.content);
        const webContent = await fetchWebpage(file.content);
        contentParts.push({
          type: 'text',
          text: `\n\n--- Webpage Content from ${file.content} ---\n${webContent}`
        });
      } else if (file.type === 'image') {
        // Add image for vision processing
        // Ensure the image is in data URL format
        let imageUrl = file.content;
        if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
          // Assume it's raw base64, convert to data URL
          // Try to detect image type from base64 header
          let mimeType = 'image/png';
          if (imageUrl.startsWith('/9j/')) {
            mimeType = 'image/jpeg';
          } else if (imageUrl.startsWith('R0lGOD')) {
            mimeType = 'image/gif';
          } else if (imageUrl.startsWith('UklGR')) {
            mimeType = 'image/webp';
          }
          imageUrl = `data:${mimeType};base64,${imageUrl}`;
        }
        contentParts.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      } else if (file.type === 'pdf') {
        // PDF text content
        contentParts.push({
          type: 'text',
          text: `\n\n--- PDF Content ---\n${file.content}`
        });
      }
    }

    console.log('Calling Lovable AI for participant extraction...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentParts }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API credits exhausted. Please add funds.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';
    
    console.log('AI response length:', aiContent.length);

    // Parse JSON from AI response
    let parsed: ParseResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw response:', aiContent.slice(0, 500));
      
      // Try to salvage partial results
      const participants: ParsedParticipant[] = [];
      const nameMatches = aiContent.match(/"name"\s*:\s*"([^"]+)"/g);
      if (nameMatches) {
        for (const match of nameMatches) {
          const name = match.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
          if (name) {
            participants.push({ name, gender: 'male' });
          }
        }
      }
      
      if (participants.length > 0) {
        console.log(`Salvaged ${participants.length} participants`);
        parsed = { participants, confidence: 0.5 };
      } else {
        throw new Error('Could not parse participant list');
      }
    }

    console.log('Parsed participants:', {
      count: parsed.participants?.length || 0,
      discipline: parsed.detected_discipline,
      confidence: parsed.confidence
    });

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-tournament-participants:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
