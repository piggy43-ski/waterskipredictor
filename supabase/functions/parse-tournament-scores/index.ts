import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedAthlete {
  name: string;
  score: string;
  position?: number;
  made_finals: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
  notes?: string;
}

interface ParseResponse {
  athletes: ParsedAthlete[];
  discipline?: string;
  gender?: string;
  confidence: number;
  raw_text?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_base64, image_url, webpage_url, discipline, gender, is_pdf } = await req.json();
    
    if (!image_base64 && !image_url && !webpage_url) {
      return new Response(
        JSON.stringify({ error: 'Either image_base64, image_url, or webpage_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert at reading waterski tournament results from images or webpage content. 
Your task is to extract athlete results from the content provided.

IMPORTANT RULES:
1. For SLALOM scores: Use format "buoys@rope" (e.g., "2@43", "3.5@41", "4@39"). The @ separates buoys from rope length.
2. For TRICK scores: Just the numeric points (e.g., "10850", "9200")
3. For JUMP scores: Distance in meters (e.g., "68.4", "55.2")

PERFORMANCE INDICATORS to look for:
- "OPT" or "Opt" = athlete opted out / didn't make finals (made_finals: false)
- "PRELIM" or just preliminary score = didn't make finals (made_finals: false)
- "FINAL" or finals score present = made finals (made_finals: true)
- "0" as first pass or "FALL" on first = missed_first_pass: true
- "X" or crossed out score = missed_gate: true
- "DNF" = Did Not Finish, missed_gate: true
- "DNS" = Did Not Start, made_finals: false

Extract ALL athletes you can see, even if some data is unclear.
If you're unsure about something, add it to the notes field.`;

    const userPromptBase = `${discipline ? `Discipline: ${discipline}` : 'Detect the discipline from the content.'}
${gender ? `Gender category: ${gender}` : 'Detect the gender category from the content.'}

Return a JSON object with this exact structure:
{
  "athletes": [
    {
      "name": "Athlete Name",
      "score": "score in proper format",
      "position": 1,
      "made_finals": true,
      "missed_first_pass": false,
      "missed_gate": false,
      "notes": "any observations"
    }
  ],
  "discipline": "slalom|trick|jump",
  "gender": "male|female",
  "confidence": 0.95,
  "raw_text": "any raw text you extracted that might be useful"
}

Return ONLY the JSON object, no other text.`;

    let messages: any[];

    // Handle webpage URL - fetch content and use text-based analysis
    if (webpage_url) {
      console.log('Fetching webpage:', webpage_url);
      
      try {
        const webResponse = await fetch(webpage_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TournamentParser/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        
        if (!webResponse.ok) {
          throw new Error(`Failed to fetch webpage: ${webResponse.status}`);
        }
        
        const html = await webResponse.text();
        
        // Extract text content from HTML (basic extraction)
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 15000); // Limit content size
        
        console.log('Extracted text length:', textContent.length);
        
        messages = [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Analyze this waterski tournament results webpage content and extract all athlete results.

URL: ${webpage_url}

WEBPAGE CONTENT:
${textContent}

${userPromptBase}`
          }
        ];
      } catch (fetchError) {
        console.error('Error fetching webpage:', fetchError);
        return new Response(
          JSON.stringify({ error: `Failed to fetch webpage: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Handle image-based parsing
      const mimeType = is_pdf ? 'application/pdf' : 'image/jpeg';
      const imageContent = image_base64 
        ? { type: "image_url", image_url: { url: `data:${mimeType};base64,${image_base64}` } }
        : { type: "image_url", image_url: { url: image_url } };

      messages = [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: `Analyze this waterski tournament results image.\n\n${userPromptBase}` },
            imageContent
          ]
        }
      ];
    }

    console.log('Calling Lovable AI for parsing...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'AI returned empty response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

    console.log('AI response length:', content.length);

    // Parse the JSON from AI response
    let parsed: ParseResponse;
    try {
      // Try direct parse first
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try to extract JSON object
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      // Try to salvage truncated JSON by finding valid athletes array
      try {
        const athletesMatch = content.match(/"athletes"\s*:\s*\[([\s\S]*)/);
        if (athletesMatch) {
          let athletesStr = athletesMatch[1];
          // Find the last complete object
          const lastCompleteObject = athletesStr.lastIndexOf('}');
          if (lastCompleteObject > 0) {
            athletesStr = athletesStr.substring(0, lastCompleteObject + 1);
            // Count brackets to ensure valid array
            const bracketCount = (athletesStr.match(/\{/g) || []).length;
            const closingCount = (athletesStr.match(/\}/g) || []).length;
            if (bracketCount === closingCount) {
              const fixedJson = `{"athletes":[${athletesStr}],"confidence":0.7,"raw_text":"Partial parse - some data may be missing"}`;
              parsed = JSON.parse(fixedJson);
              console.log('Salvaged partial JSON with', parsed.athletes?.length, 'athletes');
            } else {
              throw new Error('Could not repair truncated JSON');
            }
          } else {
            throw new Error('No complete athlete objects found');
          }
        } else {
          throw new Error('No athletes array found');
        }
      } catch (salvageError) {
        console.error('Could not salvage truncated response:', salvageError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to parse AI response - result may be too large', 
            raw_content: content.substring(0, 500) + '...' 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate and clean up the response
    if (!parsed.athletes || !Array.isArray(parsed.athletes)) {
      parsed.athletes = [];
    }

    // Ensure all athletes have required fields
    parsed.athletes = parsed.athletes.map((athlete, index) => ({
      name: athlete.name || `Unknown ${index + 1}`,
      score: athlete.score || '',
      position: athlete.position || index + 1,
      made_finals: athlete.made_finals ?? true,
      missed_first_pass: athlete.missed_first_pass ?? false,
      missed_gate: athlete.missed_gate ?? false,
      notes: athlete.notes || undefined,
    }));

    console.log('Parsed results:', JSON.stringify(parsed, null, 2));

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-tournament-scores:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
