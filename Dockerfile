FROM        alpine:latest
LABEL  Form.io <support@form.io>

WORKDIR /usr/src/app
COPY package.json ./
RUN yarn install; yarn build

CMD ["node", "dist/main"]
