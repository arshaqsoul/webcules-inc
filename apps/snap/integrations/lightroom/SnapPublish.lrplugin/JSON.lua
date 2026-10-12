-- JSON.lua — minimal JSON encoder/decoder for the Snap publish plugin.
--
-- Lightroom's embedded Lua has no JSON module and the plugin sandbox has no
-- external libraries, so this is a small self-contained implementation.
-- It covers exactly what the snap integration API needs:
--   - encode: nil/null, booleans, numbers (integers kept exact), strings,
--     sequential arrays, string-keyed objects; depth-capped at 64
--   - decode: the full grammar incl. \uXXXX escapes (with surrogate pairs,
--     converted to UTF-8), arrays, objects, nulls (as json.null)
-- It is intentionally conservative: unknown input raises an error with the
-- byte offset rather than guessing.

local M = {}

-- Sentinel for JSON null (distinct from nil so object keys survive round-trips).
M.null = setmetatable({}, { __tostring = function() return "json.null" end })

local MAX_DEPTH = 64

-- ---------------- encode ----------------

local ESCAPES = {
    ['"']  = '\\"',
    ['\\'] = '\\\\',
    ['\b'] = '\\b',
    ['\f'] = '\\f',
    ['\n'] = '\\n',
    ['\r'] = '\\r',
    ['\t'] = '\\t',
}

local function encodeString(s)
    local out = { '"' }
    for i = 1, #s do
        local c = s:sub(i, i)
        local esc = ESCAPES[c]
        if esc then
            out[#out + 1] = esc
        else
            local b = c:byte()
            if b < 0x20 then
                out[#out + 1] = string.format('\\u%04x', b)
            else
                out[#out + 1] = c
            end
        end
    end
    out[#out + 1] = '"'
    return table.concat(out)
end

local function isArray(t)
    local n = #t
    if n == 0 then return false end
    local count = 0
    for _ in pairs(t) do
        count = count + 1
        if count > n then return false end
    end
    return count == n
end

local function encode(v, depth)
    if depth > MAX_DEPTH then error("JSON: nesting too deep", 0) end
    local t = type(v)
    if v == nil or v == M.null then
        return "null"
    elseif t == "boolean" then
        return v and "true" or "false"
    elseif t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then
            error("JSON: cannot encode non-finite number", 0)
        end
        if v == math.floor(v) and math.abs(v) < 2 ^ 53 then
            return string.format("%d", v)
        end
        return string.format("%.14g", v)
    elseif t == "string" then
        return encodeString(v)
    elseif t == "table" then
        if isArray(v) then
            local parts = {}
            for i = 1, #v do parts[i] = encode(v[i], depth + 1) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local parts = {}
        for k, val in pairs(v) do
            if type(k) ~= "string" then
                error("JSON: object key is " .. type(k) .. ", need string", 0)
            end
            parts[#parts + 1] = encodeString(k) .. ":" .. encode(val, depth + 1)
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    error("JSON: cannot encode " .. t, 0)
end

function M.encode(v)
    return encode(v, 0)
end

-- ---------------- decode ----------------

local Parser = {}
Parser.__index = Parser

function Parser.new(s)
    if type(s) ~= "string" then error("JSON: input is not a string", 0) end
    return setmetatable({ s = s, pos = 1 }, Parser)
end

function Parser:err(msg)
    error(string.format("JSON: %s at offset %d", msg, self.pos), 0)
end

function Parser:skipWs()
    while self.pos <= #self.s do
        local c = self.s:sub(self.pos, self.pos)
        if c == " " or c == "\t" or c == "\n" or c == "\r" then
            self.pos = self.pos + 1
        else
            break
        end
    end
end

function Parser:peek()
    if self.pos > #self.s then self:err("unexpected end of input") end
    return self.s:sub(self.pos, self.pos)
end

function Parser:take()
    local c = self:peek()
    self.pos = self.pos + 1
    return c
end

function Parser:expect(c)
    if self:take() ~= c then self:err("expected '" .. c .. "'") end
end

-- Encode a codepoint as UTF-8 bytes (no bit ops — Lightroom's Lua may be 5.1).
local function utf8(cp)
    if cp < 0x80 then
        return string.char(cp)
    elseif cp < 0x800 then
        return string.char(192 + math.floor(cp / 64), 128 + (cp % 64))
    elseif cp < 0x10000 then
        return string.char(
            224 + math.floor(cp / 4096),
            128 + (math.floor(cp / 64) % 64),
            128 + (cp % 64)
        )
    else
        return string.char(
            240 + math.floor(cp / 262144),
            128 + (math.floor(cp / 4096) % 64),
            128 + (math.floor(cp / 64) % 64),
            128 + (cp % 64)
        )
    end
end

function Parser:parseHex4()
    if self.pos + 3 > #self.s then self:err("truncated \\u escape") end
    local hex = self.s:sub(self.pos, self.pos + 3)
    local cp = tonumber(hex, 16)
    if not cp then self:err("bad \\u escape '" .. hex .. "'") end
    self.pos = self.pos + 4
    return cp
end

function Parser:parseString()
    self:expect('"')
    local out = {}
    while true do
        if self.pos > #self.s then self:err("unterminated string") end
        local c = self:take()
        if c == '"' then
            return table.concat(out)
        elseif c == "\\" then
            local e = self:take()
            if e == '"' or e == "\\" or e == "/" then
                out[#out + 1] = e
            elseif e == "b" then out[#out + 1] = "\b"
            elseif e == "f" then out[#out + 1] = "\f"
            elseif e == "n" then out[#out + 1] = "\n"
            elseif e == "r" then out[#out + 1] = "\r"
            elseif e == "t" then out[#out + 1] = "\t"
            elseif e == "u" then
                local cp = self:parseHex4()
                -- surrogate pair?
                if cp >= 0xD800 and cp <= 0xDBFF then
                    if self.s:sub(self.pos, self.pos + 1) ~= "\\u" then
                        self:err("lone high surrogate")
                    end
                    self.pos = self.pos + 2
                    local lo = self:parseHex4()
                    if lo < 0xDC00 or lo > 0xDFFF then self:err("bad low surrogate") end
                    cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
                elseif cp >= 0xDC00 and cp <= 0xDFFF then
                    self:err("lone low surrogate")
                end
                out[#out + 1] = utf8(cp)
            else
                self:err("bad escape '\\" .. e .. "'")
            end
        else
            out[#out + 1] = c
        end
    end
end

function Parser:parseNumber()
    local start = self.pos
    if self:peek() == "-" then self.pos = self.pos + 1 end
    while self.pos <= #self.s do
        local c = self.s:sub(self.pos, self.pos)
        if c:match("[0-9eE+%.%-]") then
            self.pos = self.pos + 1
        else
            break
        end
    end
    local n = tonumber(self.s:sub(start, self.pos - 1))
    if not n then self:err("bad number") end
    return n
end

function Parser:parseValue()
    self:skipWs()
    local c = self:peek()
    if c == "{" then
        self.pos = self.pos + 1
        local obj = {}
        self:skipWs()
        if self:peek() == "}" then self.pos = self.pos + 1; return obj end
        while true do
            self:skipWs()
            local key = self:parseString()
            self:skipWs()
            self:expect(":")
            obj[key] = self:parseValue()
            self:skipWs()
            local sep = self:take()
            if sep == "}" then
                return obj
            elseif sep ~= "," then
                self:err("expected ',' or '}'")
            end
        end
    elseif c == "[" then
        self.pos = self.pos + 1
        local arr = {}
        self:skipWs()
        if self:peek() == "]" then self.pos = self.pos + 1; return arr end
        while true do
            arr[#arr + 1] = self:parseValue()
            self:skipWs()
            local sep = self:take()
            if sep == "]" then
                return arr
            elseif sep ~= "," then
                self:err("expected ',' or ']'")
            end
        end
    elseif c == '"' then
        return self:parseString()
    elseif c == "-" or c:match("[0-9]") then
        return self:parseNumber()
    elseif self.s:sub(self.pos, self.pos + 3) == "true" then
        self.pos = self.pos + 4; return true
    elseif self.s:sub(self.pos, self.pos + 4) == "false" then
        self.pos = self.pos + 5; return false
    elseif self.s:sub(self.pos, self.pos + 3) == "null" then
        self.pos = self.pos + 4; return M.null
    end
    self:err("unexpected character '" .. c .. "'")
end

function M.decode(s)
    local p = Parser.new(s)
    local v = p:parseValue()
    p:skipWs()
    if p.pos <= #p.s then p:err("trailing characters") end
    return v
end

return M
