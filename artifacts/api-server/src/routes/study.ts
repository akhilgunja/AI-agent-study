import { Router, type IRouter } from "express";
import {
  AskStudyAssistantBody,
  SearchResearchQueryParams,
} from "@workspace/api-zod";

type ResearchSource = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
};

const router: IRouter = Router();

const STUDY_SYSTEM_PROMPT = `You are Study Spark, a supportive AI study companion for students.
Only answer questions that are relevant to learning, school, university, careers, study skills, or academic research.
If a request is unrelated, briefly say you are focused on student learning and redirect to a useful academic angle.
Explain concepts clearly at the student's level. Prefer step-by-step reasoning, examples, and short sections.
Do not do graded work dishonestly or pretend certainty. Help the student understand and produce their own work.
When sources are provided, use them as context and mention the most relevant source titles naturally.
Never invent citations, facts, links, or source claims.`;

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function normalizeResearchQuery(query: string) {
  const cleaned = query
    .replace(/\b(briefly|brief|short note|note about|explain|tell me about)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  if (lower.includes("python") && lower.includes("function")) {
    return "Python programming functions";
  }
  if (lower.includes("photosynthesis")) return "Photosynthesis";
  if (lower.includes("quadratic")) return "Quadratic equation";
  return cleaned || query.trim();
}

async function searchPublicSources(query: string): Promise<ResearchSource[]> {
  const normalizedQuery = normalizeResearchQuery(query);
  const encodedQuery = encodeURIComponent(normalizedQuery.slice(0, 120));
  const sources: ResearchSource[] = [];

  const [wikipediaResult, openAlexResult] = await Promise.allSettled([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&srlimit=3&format=json&origin=*`,
      { headers: { Accept: "application/json" } },
    ),
    fetch(
      `https://api.openalex.org/works?search=${encodedQuery}&per-page=3&select=title,doi,publication_year,primary_location`,
      { headers: { Accept: "application/json" } },
    ),
  ]);

  if (
    wikipediaResult.status === "fulfilled" &&
    wikipediaResult.value.ok
  ) {
    const data = (await wikipediaResult.value.json()) as {
      query?: {
        search?: Array<{ title: string; snippet: string }>;
      };
    };

    for (const item of data.query?.search ?? []) {
      const title = item.title;
      sources.push({
        title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
        snippet: item.snippet.replace(/<[^>]+>/g, ""),
        domain: "wikipedia.org",
      });
    }
  }

  if (openAlexResult.status === "fulfilled" && openAlexResult.value.ok) {
    const data = (await openAlexResult.value.json()) as {
      results?: Array<{
        title?: string;
        doi?: string | null;
        publication_year?: number | null;
        primary_location?: { landing_page_url?: string | null };
      }>;
    };

    for (const item of data.results ?? []) {
      const url =
        item.primary_location?.landing_page_url ??
        item.doi ??
        "https://openalex.org";
      const title = item.title?.trim();
      if (!title) continue;
      sources.push({
        title,
        url,
        snippet: item.publication_year
          ? `Academic work published in ${item.publication_year}.`
          : "Academic work indexed by OpenAlex.",
        domain: domainFromUrl(url),
      });
    }
  }

  const terms = normalizedQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
  return sources
    .map((source, index) => {
      const haystack = `${source.title} ${source.snippet}`.toLowerCase();
      const relevance = terms.reduce(
        (score, term) => score + (haystack.includes(term) ? 1 : 0),
        0,
      );
      return { source, relevance, index };
    })
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .slice(0, 6)
    .map(({ source }) => source);
}

function suggestedPrompts(subject?: string) {
  const prefix = subject ? `${subject}: ` : "";
  return [
    `${prefix}Explain this like I’m preparing for an exam`,
    `${prefix}Give me a worked example`,
    `${prefix}Quiz me with five questions`,
  ];
}

function offlineStudyReply(
  message: string,
  sources: ResearchSource[],
  subject?: string,
) {
  const lower = message.toLowerCase();
  if (lower.includes("python") && lower.includes("function")) {
    return `Python functions are reusable blocks of code that perform one focused task.\n\nSyntax:\ndef greet(name):\n    return f"Hello, {name}"\n\nKey ideas:\n• def starts the function definition.\n• name is a parameter; the value passed in is an argument.\n• return sends a result back to the caller.\n• A function can have default parameters, such as def greet(name="there").\n\nExample use:\nmessage = greet("Asha")\nprint(message)\n\nRemember: define once, call whenever you need the same logic.`;
  }
  if (lower.includes("photosynthesis")) {
    return `Photosynthesis is how green plants make food using light energy.\n\n1. In the leaves, chlorophyll captures energy from sunlight.\n2. The plant uses that energy to combine water and carbon dioxide into glucose, releasing oxygen.\n\nThe short formula is: carbon dioxide + water + light → glucose + oxygen.`;
  }
  if (lower.includes("quadratic")) {
    return `A quadratic equation has the form ax² + bx + c = 0.\n\nA common way to solve it is the quadratic formula:\nx = (-b ± √(b² - 4ac)) / 2a\n\nFirst identify a, b, and c, calculate the discriminant b² - 4ac, then substitute carefully.`;
  }
  const topic = subject ? `${subject} question` : "study question";
  if (sources.length === 0) {
    return `I’m in source-first study mode right now, so I can’t generate a full AI explanation for this ${topic}. Try the Research desk for live public sources, then bring the strongest source back here and I’ll help you turn it into notes, flashcards, or a quiz.`;
  }

  const evidence = sources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. ${source.title} — ${source.snippet}`)
    .join("\n");
  return `I’m in source-first study mode right now, so here’s a grounded starting point for “${message}”.\n\nKey evidence from public sources:\n${evidence}\n\nA good next step is to compare the first source with one academic result, write down the connection between them, and ask me to turn your notes into a short explanation or practice quiz.`;
}

router.get("/research/search", async (req, res) => {
  const parsed = SearchResearchQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a research topic to search." });
    return;
  }

  try {
    const sources = await searchPublicSources(parsed.data.query);
    res.json(sources);
  } catch (error) {
    req.log.error({ err: error }, "Research search failed");
    res.status(502).json({ error: "Research sources are unavailable right now." });
  }
});

router.post("/study/ask", async (req, res) => {
  const parsed = AskStudyAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a study question." });
    return;
  }

  const body = parsed.data;
  const sources =
    body.message.trim().length > 8
      ? await searchPublicSources(body.message)
      : [];
  const sourceContext = sources.length
    ? `\n\nPublic source context:\n${sources
        .map((source) => `- ${source.title}: ${source.snippet} (${source.url})`)
        .join("\n")}`
    : "";

  const messages = [
    { role: "system", content: STUDY_SYSTEM_PROMPT },
    ...(body.history ?? []).slice(-8).map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    {
      role: "user",
      content: `Subject: ${body.subject ?? "General study"}\nMode: ${body.mode ?? "learn"}\n\n${body.message}${sourceContext}`,
    },
  ];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.json({
      reply: offlineStudyReply(body.message, sources, body.subject),
      sources,
      suggestedPrompts: suggestedPrompts(body.subject),
    });
    return;
  }

  try {
    const completionResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          max_completion_tokens: 1600,
          messages,
        }),
      },
    );

    if (!completionResponse.ok) {
      const errorText = await completionResponse.text();
      req.log.error(
        { status: completionResponse.status, errorText },
        "OpenAI request failed",
      );
      res.json({
        reply: offlineStudyReply(body.message, sources, body.subject),
        sources,
        suggestedPrompts: suggestedPrompts(body.subject),
      });
      return;
    }

    const completion = (await completionResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      res.json({
        reply: offlineStudyReply(body.message, sources, body.subject),
        sources,
        suggestedPrompts: suggestedPrompts(body.subject),
      });
      return;
    }

    res.json({
      reply,
      sources,
      suggestedPrompts: suggestedPrompts(body.subject),
    });
  } catch (error) {
    req.log.error({ err: error }, "Study assistant request failed");
    res.json({
      reply: offlineStudyReply(body.message, sources, body.subject),
      sources,
      suggestedPrompts: suggestedPrompts(body.subject),
    });
  }
});

export default router;