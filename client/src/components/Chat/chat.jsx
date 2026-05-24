import React, { useRef, useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import Delete from './Delete'
import Stickers from './Stickers'
import VoiceMessage from './VoiceMessage'
import VideoCall from './VideoCall'

export default function Chat({ socket, user }) {
    const messageRef = useRef()
    const fileRef = useRef()
    const bottomRef = useRef()
    const [mensageList, setMensageList] = useState([])
    const [uploading, setUploading] = useState(false)
    const [unread, setUnread] = useState(0)
    const [showScrollBtn, setShowScrollBtn] = useState(false)
    const [showStickers, setShowStickers] = useState(false)

    useEffect(() => {
        const q = query(collection(db, 'messages'), orderBy('createdAt'))
        const unsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            setMensageList(msgs)
        })
        return () => unsub()
    }, [])

    useEffect(() => {
        socket.emit('set_username', user?.displayName)
    }, [user])

    useEffect(() => {
        if (Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }, [])

    useEffect(() => {
        if (!showScrollBtn) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [mensageList])

    const playNotificationSound = () => {
        const ctx = new AudioContext()
        const oscillator = ctx.createOscillator()
        const gainNode = ctx.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(ctx.destination)

        oscillator.frequency.setValueAtTime(587, ctx.currentTime)
        oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.1)

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.3)
    }

    useEffect(() => {
        if (mensageList.length === 0) return
        const last = mensageList[mensageList.length - 1]
        if (last.authorId === socket.id) return

        // Som de notificação
        playNotificationSound()

        if (document.hidden && Notification.permission === 'granted') {
            new Notification(`${last.authorUsername}`, {
                body: last.imageUrl ? '📷 Enviou uma imagem' : last.text,
                icon: '/vite.svg'
            })
        }

        if (document.hidden) {
            setUnread(prev => {
                document.title = `(${prev + 1}) Chat Real`
                return prev + 1
            })
        }
    }, [mensageList])

    useEffect(() => {
        const handleFocus = () => {
            setUnread(0)
            document.title = 'Chat Real'
        }
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [])

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
        setShowScrollBtn(!isAtBottom)
    }

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        setShowScrollBtn(false)
    }

    const handlesSubmit = async () => {
        const message = messageRef.current.value
        if (!message.trim()) return
        await addDoc(collection(db, 'messages'), {
            text: message,
            authorUsername: user?.displayName ?? 'Anônimo',
            authorId: socket.id,
            createdAt: serverTimestamp()
        })
        clearInput()
    }

    const handleImageUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)
        try {
            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
                { method: 'POST', body: formData }
            )
            const data = await res.json()
            await addDoc(collection(db, 'messages'), {
                text: '',
                imageUrl: data.secure_url,
                authorUsername: user?.displayName ?? 'Anônimo',
                authorId: socket.id,
                createdAt: serverTimestamp()
            })
        } catch (err) {
            console.error('Erro ao enviar imagem:', err)
        } finally {
            setUploading(false)
            fileRef.current.value = ''
        }
    }

    const clearInput = () => {
        messageRef.current.value = ''
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
            padding: '16px',
            height: '100vh',
            boxSizing: 'border-box'
        }}>
            <h1>WhatsApp 2</h1>

            <div
                onScroll={handleScroll}
                style={{
                    width: '100%',
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginBottom: '8px'
                }}
            >
                {/* MAP — renderiza cada mensagem usando o componente Delete */}
                {mensageList.map((message, index) => (
                    <Delete
                        key={message.id ?? index}
                        message={message}
                        currentUser={user}
                    />
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Botão de rolar para baixo */}
            {showScrollBtn && (
                <button
                    onClick={scrollToBottom}
                    style={{
                        position: 'fixed',
                        bottom: '80px',
                        right: '20px',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        fontSize: '20px',
                        cursor: 'pointer',
                        background: '#25D366',
                        color: '#fff',
                        border: 'none'
                    }}
                >
                    ↓
                </button>
            )}

            {/* Painel de figurinhas */}
            {showStickers && (
                <Stickers
                    user={user}
                    socket={socket}
                    onClose={() => setShowStickers(false)}
                />
            )}

            {/* Input de mensagem */}
            <div style={{
                display: 'flex',
                gap: '8px',
                width: '100%'
            }}>
                <input
                    type="text"
                    ref={messageRef}
                    placeholder='Mensagem'
                    onKeyDown={(e) => e.key === 'Enter' && handlesSubmit()}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
                />
                <button onClick={handlesSubmit}>Enviar</button>
                <input
                    type="file"
                    accept="image/*"
                    ref={fileRef}
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                />
                <button onClick={() => fileRef.current.click()} disabled={uploading}>
                    {uploading ? '...' : '📷'}
                </button>
                {/* Botão de figurinhas */}
                <button onClick={() => setShowStickers(!showStickers)}>
                    🎭
                </button>
                {/* Botão de mensagem de voz */}
                <VoiceMessage user={user} socket={socket} />
                {/* Botão de videochamada */}
                <VideoCall socket={socket} user={user} />
            </div>
        </div>
    )
}