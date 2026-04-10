import type { FastifyRequest } from "fastify";

export type ParsedFile = {
  fieldname: string;
  buffer: Buffer;
  mimetype: string;
};

/** Consume full multipart body (fields + files). */
export async function readMultipart(request: FastifyRequest): Promise<{
  fields: Record<string, string>;
  files: ParsedFile[];
}> {
  const fields: Record<string, string> = {};
  const files: ParsedFile[] = [];

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      files.push({
        fieldname: part.fieldname,
        buffer,
        mimetype: part.mimetype || "application/octet-stream",
      });
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, files };
}

export function filesNamed(files: ParsedFile[], name: string): ParsedFile[] {
  return files.filter((f) => f.fieldname === name);
}

export function firstFileNamed(
  files: ParsedFile[],
  name: string
): ParsedFile | undefined {
  return files.find((f) => f.fieldname === name);
}
