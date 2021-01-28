FROM        alpine:latest
LABEL  Form.io <support@form.io>

WORKDIR /usr/src/app
COPY package.json ./
RUN npm install

CMD ["yarn", "start"]
