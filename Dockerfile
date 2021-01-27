FROM        alpine:latest
LABEL  Form.io <support@form.io>

WORKDIR /usr/src/app
COPY package.json ./
RUN yarn install

CMD ["yarn", "start"]
