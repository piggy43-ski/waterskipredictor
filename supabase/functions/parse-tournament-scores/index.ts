import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedAthlete {
  name: string;
  score: string;
  gender: 'male' | 'female';
  position?: number;
  made_finals: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
  notes?: string;
}

interface ParseResponse {
  athletes: ParsedAthlete[];
  discipline?: string;
  confidence: number;
  raw_text?: string;
}

// Validate and correct slalom flags based on score analysis
const validateSlalomFlags = (athlete: ParsedAthlete, discipline: string): ParsedAthlete => {
  if (discipline !== 'slalom' || !athlete.score) return athlete;
  
  const parts = athlete.score.split('@');
  if (parts.length !== 2) return athlete;
  
  const buoys = parseFloat(parts[0]);
  const rope = parseFloat(parts[1]);
  
  if (isNaN(buoys) || isNaN(rope)) return athlete;
  
  // Longest ropes in slalom (18.25m, 16m are typical starting ropes)
  const isLongestRope = rope >= 16;
  
  // MISSED FIRST PASS DETECTION:
  // - "0@18.25" = missed entry gate on first pass
  // - "4@18.25" (any buoys < 6 at longest rope as FINAL score) = fell during first pass
  if (isLongestRope && buoys < 6) {
    athlete.missed_first_pass = true;
    if (buoys === 0) {
      athlete.notes = (athlete.notes ? athlete.notes + ' | ' : '') + 'Missed entry gate on first pass';
    } else {
      athlete.notes = (athlete.notes ? athlete.notes + ' | ' : '') + 'Fell during first pass';
    }
  }
  
  // MISSED GATE DETECTION for mid-run:
  // - "0@[rope]" where rope is NOT the longest = missed entrance gates on that pass
  if (buoys === 0 && !isLongestRope) {
    athlete.missed_gate = true;
    athlete.notes = (athlete.notes ? athlete.notes + ' | ' : '') + `Missed entrance gate at ${rope}m`;
  }
  
  // "6@[rope]" where rope is not shortest (9.5m) could indicate exit gate miss
  // But this is harder to detect without knowing full run context
  
  return athlete;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_base64, image_url, webpage_url, discipline, is_pdf } = await req.json();
    
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

CRITICAL: DETECT GENDER FROM DOCUMENT
- Look for section headers: "Men's Slalom", "Women's Trick", "Open Men", "Open Women", "Male", "Female"
- Results pages often have separate tables/sections for each gender
- ALWAYS assign gender to each athlete based on which section they appear in
- If a single document has BOTH genders, return ALL athletes with their respective gender

DISCIPLINE DETECTION:
- Slalom: scores like "2@10.25", "3.5@11.25", buoys at rope length
- Trick: numeric points (e.g., "10850", "9200")  
- Jump: distance in meters (e.g., "68.4", "55.2")

SLALOM SCORING RULES (CRITICAL):
- Format: "buoys@rope" where rope is in meters
- Standard rope lengths (longest to shortest): 18.25, 16, 14.25, 13, 12, 11.25, 10.75, 10.25, 9.75, 9.5
- Each pass has 6 buoys max. Completing 6 buoys = advance to shorter rope

MISSED FIRST PASS DETECTION (set missed_first_pass: true):
- Score is "0@18.25" or "0@[longest rope]" = missed entry gate on first pass
- Score like "4@18.25" (any buoys < 6 at longest rope 18.25 or 16 as FINAL score) = fell during first pass
- Basically: if their FINAL score is at the longest rope length (18.25m or 16m), they had issues on first pass

MISSED GATE DETECTION (set missed_gate: true):
- "0@[rope]" in middle of run (not first pass) = missed entrance gates on that pass
- "6@[rope]" as FINAL score where the rope is not 9.5m = missed exit gate (completed 6 buoys but couldn't make the turn)

OTHER PERFORMANCE INDICATORS:
- "OPT" or "Opt" = opted out / didn't make finals (made_finals: false)
- "PRELIM" = preliminary score only (made_finals: false)
- "FINAL" = made finals (made_finals: true)
- "DNF" = Did Not Finish (missed_gate: true)
- "DNS" = Did Not Start (made_finals: false)

Extract ALL athletes you can see. If unsure about something, add it to the notes field.`;

    const userPromptBase = `${discipline ? `Discipline hint: ${discipline}` : 'Detect the discipline from the content.'}

IMPORTANT: Detect gender from document sections (Men's/Women's headers) and assign to each athlete.

Return a JSON object with this exact structure:
{
  "athletes": [
    {
      "name": "Athlete Name",
      "score": "score in proper format",
      "gender": "male or female based on document section",
      "position": 1,
      "made_finals": true,
      "missed_first_pass": false,
      "missed_gate": false,
      "notes": "any observations"
    }
  ],
  "discipline": "slalom|trick|jump",
  "confidence": 0.95,
  "raw_text": "any raw text you extracted that might be useful"
}

CRITICAL: Each athlete MUST have a "gender" field set to "male" or "female".

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

    const detectedDiscipline = parsed.discipline || discipline || 'slalom';

    // Ensure all athletes have required fields and validate slalom flags
    parsed.athletes = parsed.athletes.map((athlete, index) => {
      let processedAthlete: ParsedAthlete = {
        name: athlete.name || `Unknown ${index + 1}`,
        score: athlete.score || '',
        gender: athlete.gender === 'female' ? 'female' : 'male', // Default to male if not specified
        position: athlete.position || index + 1,
        made_finals: athlete.made_finals ?? true,
        missed_first_pass: athlete.missed_first_pass ?? false,
        missed_gate: athlete.missed_gate ?? false,
        notes: athlete.notes || undefined,
      };
      
      // Post-process slalom scores to validate/correct flags
      processedAthlete = validateSlalomFlags(processedAthlete, detectedDiscipline);
      
      return processedAthlete;
    });

    console.log('Parsed results:', JSON.stringify({
      athleteCount: parsed.athletes.length,
      maleCount: parsed.athletes.filter(a => a.gender === 'male').length,
      femaleCount: parsed.athletes.filter(a => a.gender === 'female').length,
      discipline: detectedDiscipline,
    }));

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
