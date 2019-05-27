import express, { RequestHandler } from "express"
import { Express } from "express"
import { PathParams, Request, Response } from "express-serve-static-core"
import * as t from "io-ts"
import { TaskEither, fromEither } from "fp-ts/lib/TaskEither"
import { right } from "fp-ts/lib/Either"
import { IntegerFromString } from "io-ts-types"

interface TypedResponse<T = unknown> {
  status: number
  body?: T
}

interface TypedRequest<P, B> {
  params: P
  body: B
}
type ValidatedRequest<P, B> = Pick<
  Request,
  Exclude<keyof Request, ["body", "params"]>
> &
  TypedRequest<P, B>

type RequestType = "get" | "post" | "put"

interface RequestContract<P, B> {
  type: RequestType
  decoder: t.Decoder<unknown, TypedRequest<P, B>>
}

type TypedHandler<P, B, O> = (
  path: PathParams,
  handler: (
    req: TypedRequest<P, B>,
  ) => TaskEither<TypedResponse<string>, TypedResponse<O>>,
) => void

interface ExpressM {
  serve: <P, B, O>(contract: RequestContract<P, B>) => TypedHandler<P, B, O>
}

const aggregateErrors = (errors: t.Errors): TypedResponse => ({
  status: 400,
  body: errors.map(e => e.message).join("\n"),
})

const writeToResponse = (res: Response) => (data: TypedResponse) => {
  res.status(data.status)
  res.send(
    typeof data.body === "string" ? data.body : JSON.stringify(data.body),
  )
}

const decode = <I, O>(decoder: t.Decoder<I, O>, input: I) =>
  fromEither(decoder.decode(input))

const mergeDecoded = (req: Request) => <P, B>(
  decoded: TypedRequest<P, B>,
): ValidatedRequest<P, B> => Object.assign({}, req, decoded)

const handleRequest = <P, B, O>(
  decoder: t.Decoder<unknown, TypedRequest<P, B>>,
  handler: (
    req: TypedRequest<P, B>,
  ) => TaskEither<TypedResponse<string>, TypedResponse<O>>,
): RequestHandler => (req, res) =>
  decode(decoder, req)
    .bimap(aggregateErrors, mergeDecoded(req))
    .chain(handler)
    .fold(writeToResponse(res), writeToResponse(res))
    .run()

export const wrap = (app: Express) =>
  Object.assign<Express, ExpressM>(app, {
    serve: <P, B, O>(contract: RequestContract<P, B>) => (
      path: PathParams,
      handler: (
        req: TypedRequest<P, B>,
      ) => TaskEither<TypedResponse<string>, TypedResponse<O>>,
    ) => {
      app[contract.type](path, handleRequest(contract.decoder, handler))
    },
  })

const app = wrap(express())
const port = 3000

const GetRequest = {
  type: "get" as RequestType,
  decoder: t.interface({
    params: t.interface({ id: IntegerFromString }),
    body: t.any,
  }),
}
const PostRequest = {
  type: "post" as RequestType,
  decoder: t.interface({
    params: t.unknown,
    body: t.interface({ name: t.string }),
  }),
}
const PutRequest = {
  type: "put" as RequestType,
  decoder: t.interface({
    params: t.interface({ id: IntegerFromString }),
    body: t.interface({ name: t.string }),
  }),
}

app.use(express.json())

app.serve(GetRequest)("/:id", req =>
  fromEither(right({ status: 200, body: { res: req.params.id } })),
)

app.serve(PostRequest)("/", () =>
  fromEither(
    right({ status: 200, body: { id: Math.floor(Math.random() * 1000) } }),
  ),
)

app.serve(PutRequest)("/:id", req =>
  fromEither(
    right({ status: 200, body: { id: req.params.id, result: req.body.name } }),
  ),
)

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
