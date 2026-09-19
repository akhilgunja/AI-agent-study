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

const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";

const STUDY_SYSTEM_PROMPT = `You are an AI Study Tutor designed exclusively to help students learn.

Your primary goals are factual accuracy, clear reasoning, and educational value. Carefully understand the student's question before answering. Never intentionally guess. If you are uncertain or the available context cannot verify a claim, say so clearly instead of inventing an answer.

Only answer questions relevant to learning, school, university, careers, study skills, or academic research. If a request is unrelated, respond briefly: "I am designed specifically to help with studying and academic learning. Please ask me a study-related question."

Adapt explanations to the student's selected subject and mode. Use short sections, plain language, examples, and enough detail for the student to understand the reasoning. Correct an incorrect assumption respectfully. Do not do graded work dishonestly or pretend certainty; help the student learn and produce their own work.

For mathematics and numerical problems:
1. Identify the given information.
2. Identify what must be calculated.
3. Select the correct formula or method.
4. Solve step by step.
5. Recheck the calculation.
6. State the final answer clearly.

For programming:
1. Understand the requested behavior.
2. Provide syntactically valid code in the requested language.
3. Explain the important parts.
4. Check for obvious syntax and logical errors.

For science and technical subjects, distinguish established facts from assumptions and use simple examples when useful.

When public source context is provided, use it as evidence, distinguish it from your own explanation, and mention relevant source titles naturally. Never invent citations, facts, links, or source claims.`;

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

function providerUnavailableReply(
  reason: "missing-key" | "request-failed",
  sources: ResearchSource[],
) {
  const message =
    reason === "missing-key"
      ? "Groq is not configured yet. Add GROQ_API_KEY in the secure project secrets to enable Study Spark's AI tutor."
      : "Sorry, I couldn't connect to the AI service right now. Please try again.";
  const sourceNote = sources.length
    ? "\n\nThe public research sources below are still available while the AI service is unavailable."
    : "";
  return `${message}${sourceNote}`;
}

type GroqModel = {
  id?: string;
  active?: boolean;
  owned_by?: string;
};

async function resolveGroqModel(apiKey: string) {
  const configuredModel = process.env.GROQ_MODEL?.trim();
  const response = await fetch(`${GROQ_API_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Groq model discovery failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { data?: GroqModel[] };
  const availableModels = (payload.data ?? [])
    .filter((model) => model.active !== false && model.id)
    .map((model) => model.id as string);

  if (configuredModel) {
    if (!availableModels.includes(configuredModel)) {
      throw new Error(
        `Configured GROQ_MODEL "${configuredModel}" is not available`,
      );
    }
    return configuredModel;
  }

  const preferredModels = [
    "llama-3.3-70b-versatile",
    "llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b",
    "openai/gpt-oss-120b",
  ];
  const preferred = preferredModels.find((model) =>
    availableModels.includes(model),
  );
  if (preferred) return preferred;

  const chatModel = availableModels.find(
    (model) =>
      /instruct|versatile|reasoning/i.test(model) &&
      !/whisper|guard|embedding|vision/i.test(model),
  );
  if (chatModel) return chatModel;

  throw new Error(
    "No active chat-capable Groq model was returned by the models endpoint",
  );
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.json({
      reply: providerUnavailableReply("missing-key", sources),
      sources,
      suggestedPrompts: suggestedPrompts(body.subject),
    });
    return;
  }

  try {
    const model = await resolveGroqModel(apiKey);
    req.log.info({ model }, "Groq model selected for study request");
    const completionResponse = await fetch(
      `${GROQ_API_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1600,
          messages,
        }),
      },
    );

    if (!completionResponse.ok) {
      const errorText = await completionResponse.text();
      req.log.error(
        { status: completionResponse.status, errorText },
        "Groq request failed",
      );
      res.json({
        reply: providerUnavailableReply("request-failed", sources),
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
        reply: providerUnavailableReply("request-failed", sources),
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
      reply: providerUnavailableReply("request-failed", sources),
      sources,
      suggestedPrompts: suggestedPrompts(body.subject),
    });
  }
});

export default router;