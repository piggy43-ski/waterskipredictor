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
    const { image_base64, image_url, discipline, gender } = await req.json();
    
    if (!image_base64 && !image_url) {
      return new Response(
        JSON.stringify({ error: 'Either image_base64 or image_url is required' }),
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

    // Build the image content
    const imageContent = image_base64 
      ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      : { type: "image_url", image_url: { url: image_url } };

    const systemPrompt = `You are an expert at reading waterski tournament results from images. 
Your task is to extract athlete results from the image provided.

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

    const userPrompt = `Analyze this waterski tournament results image.
${discipline ? `Discipline: ${discipline}` : 'Detect the discipline from the image.'}
${gender ? `Gender category: ${gender}` : 'Detect the gender category from the image.'}

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

    console.log('Calling Lovable AI for image parsing...');

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
          { 
            role: 'user', 
            content: [
              { type: 'text', text: userPrompt },
              imageContent
            ]
          }
        ],
        max_tokens: 4000,
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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'AI returned empty response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI raw response:', content);

    // Parse the JSON from AI response
    let parsed: ParseResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse AI response', 
          raw_content: content 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
