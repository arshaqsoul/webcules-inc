import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@webcules/ui/components/accordion";

export function FAQAccordion() {
  const faqs = [
    {
      item: "What is background.webcules.com?",
      content:
        "Background.webcules.com is a cutting-edge platform offering high-quality, AI-generated images for various uses. Our advanced AI technology creates unique, diverse, and customizable backgrounds suitable for personal and commercial projects.",
      list: [],
    },
    {
      item: "How does your pricing work",
      content: "We offer flexible pricing options to suit different needs:",
      list: [
        "Individual images: priced for each image",
        "Collections (15-25 images): Check collection page for pricing",
        "Monthly subscription: $22.99 USD for unlimited access to all images and collections",
      ],
    },
    {
      item: "What rights do I have to the images I purchase?",
      content:
        "When you purchase our images, you receive full commercial rights within acceptable use guidelines. This includes the right to use them in commercial projects, modify them, and display them publicly. However, you may not resell the unmodified images as standalone products or claim copyright on the original, unmodified images.",
      list: [],
    },
    {
      item: "Can I use these images for commercial purposes?",
      content:
        "Absolutely! All our pricing tiers, including individual purchases and subscriptions, grant you commercial usage rights. You're free to use the images in your business materials, websites, social media, and other commercial applications.",
      list: [],
    },
    {
      item: "How often are new images or collections added?",
      content:
        "We regularly update our library with new, fresh content. Subscribers can expect new collections added weekly, ensuring a constant flow of diverse and trendy images for your projects.",
      list: [],
    },
    {
      item: "What if I'm not satisfied with an image I've purchased?",
      content:
        "While we don't offer refunds for downloaded digital products, we strive for customer satisfaction. If you're experiencing issues with an image, please contact our support team, and we'll do our best to resolve your concerns or offer alternatives.",
      list: [],
    },
    {
      item: "Is my payment information secure?",
      content:
        "es, absolutely. We use Stripe, a leading secure payment processor, to handle all transactions. Your payment details are encrypted and never stored on our servers.",
      list: [],
    },
    {
      item: "Can I cancel my subscription at any time?",
      content:
        "Yes, you can cancel your subscription at any time. Your access will continue until the end of your current billing cycle, after which it will not renew.",
      list: [],
    },
    {
      item: "What sets your AI-generated images apart from stock photos?",
      content:
        "Our AI-generated images offer unique, customizable content that you won't find elsewhere. Unlike stock photos, our images are created on-demand, reducing the risk of overuse and ensuring fresh, original content for your projects.",
      list: [],
    },
    {
      item: "Do you offer customer support?",
      content:
        "Yes, we provide dedicated customer support. If you have any questions, concerns, or need assistance, you can reach our support team at business@webcules.com We aim to respond to all inquiries within 24 hours.",
      list: [],
    },
    {
      item: "Are there any restrictions on image use?",
      content:
        "While we grant extensive rights, we do have some restrictions to protect our service and other users. You may not resell unmodified images as standalone products or use them in any way that violates applicable laws or regulations. Please refer to our Terms of Service for full details.",
      list: [],
    },
    {
      item: "Can I try before I buy?",
      content:
        "Yes! We offer a selection of free sample images that you can download to test the quality and style of our AI-generated content. Additionally, our affordable individual image pricing allows you to try our service with minimal commitment.",
      list: [],
    },
  ];
  return (
    <Accordion type="single" collapsible className="w-full text-white">
      {faqs.map((faq, index) => (
        <AccordionItem
          key={index}
          value={faq.item}
          className="border-b border-white/30"
        >
          <AccordionTrigger className="text-left">{faq.item}</AccordionTrigger>
          <AccordionContent className="text-gray-500">
            {faq.content}
            {faq.list &&
              faq.list.map((item, index) => <li key={index}>{item}</li>)}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
