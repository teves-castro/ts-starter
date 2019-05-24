import express, { RequestHandler } from "express"
import { Express } from "express"
import { PathParams, Request, Response } from "express-serve-static-core"
import * as t from "io-ts"
import { TaskEither, fromEither } from "fp-ts/lib/TaskEither"
import { right } from "fp-ts/lib/Either"
import { IntegerFromString } from "io-ts-types"

interface HttpResponse<T = unknown> {
  status: number
  body?: T
}

interface DecodedRequest<P, B> {
  params: P
  body: B
}
type ValidatedRequest<P, B> = Pick<
  Request,
  Exclude<keyof Request, ["body", "params"]>
> &
  DecodedRequest<P, B>

type TypedHandler = <P, B, O>(
  decoder: t.Decoder<unknown, DecodedRequest<P, B>>,
) => (
  path: PathParams,
  handler: (
    req: DecodedRequest<P, B>,
  ) => TaskEither<HttpResponse<string>, HttpResponse<O>>,
) => void

interface ExpressM {
  readonly getM: TypedHandler
  readonly postM: TypedHandler
  readonly putM: TypedHandler
}

export type EnhancedExpress = Express & ExpressM

const aggregateErrors = (errors: t.Errors): HttpResponse => ({
  status: 400,
  body: errors.map(e => e.message).join("\n"),
})

const writeToResponse = (res: Response) => (data: HttpResponse) => {
  res.status(data.status)
  res.send(
    typeof data.body === "string" ? data.body : JSON.stringify(data.body),
  )
}

const decode = <I, O>(decoder: t.Decoder<I, O>, input: I) =>
  fromEither(decoder.decode(input))

const mergeDecoded = (req: Request) => <P, B>(
  decoded: DecodedRequest<P, B>,
): ValidatedRequest<P, B> => Object.assign({}, req, decoded)

const handleRequest = <P, B, O>(
  decoder: t.Decoder<unknown, DecodedRequest<P, B>>,
  handler: (
    req: DecodedRequest<P, B>,
  ) => TaskEither<HttpResponse<string>, HttpResponse<O>>,
): RequestHandler => (req, res) =>
  decode(decoder, req)
    .bimap(aggregateErrors, mergeDecoded(req))
    .chain(handler)
    .fold(writeToResponse(res), writeToResponse(res))
    .run()

export const wrap: (app: Express) => EnhancedExpress = app =>
  Object.assign<Express, ExpressM>(app, {
    postM: decoder => (path, handler) =>
      app.post(path, handleRequest(decoder, handler)),
    putM: decoder => (path, handler) =>
      app.put(path, handleRequest(decoder, handler)),
    getM: decoder => (path, handler) =>
      app.get(path, handleRequest(decoder, handler)),
  })

const app = wrap(express())
const port = 3000

const GetRequest = t.interface({
  params: t.interface({ id: IntegerFromString }),
  body: t.any,
})
const PostRequest = t.interface({
  params: t.unknown,
  body: t.interface({ name: t.string }),
})
const PutRequest = t.interface({
  params: t.interface({ id: IntegerFromString }),
  body: t.interface({ name: t.string }),
})
type PutRequest = t.TypeOf<typeof PutRequest>

app.use(express.json())

app.postM(PostRequest)("/", () =>
  fromEither(
    right({ status: 200, body: { id: Math.floor(Math.random() * 1000) } }),
  ),
)
app.putM(PutRequest)("/:id", req =>
  fromEither(
    right({ status: 200, body: { id: req.params.id, result: req.body.name } }),
  ),
)
app.getM(GetRequest)("/:id", req =>
  fromEither(right({ status: 200, body: { res: req.params.id } })),
)

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
