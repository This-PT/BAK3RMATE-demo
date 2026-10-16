import { createContext, useContext, useState } from 'react';

const Ctx = createContext(null);
export const useChat = () => useContext(Ctx);

// Keeps the assistant conversation while you move between pages. It lives only in memory, so it
// survives page changes but a reload starts fresh. It is created per store and per login.
export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([{ role: 'assistant', greeting: true, content: '' }]); // the greeting is shown in whichever language is on
  const [input, setInput] = useState('');
  const [voice, setVoice] = useState(true);
  return <Ctx.Provider value={{ messages, setMessages, input, setInput, voice, setVoice }}>{children}</Ctx.Provider>;
}
